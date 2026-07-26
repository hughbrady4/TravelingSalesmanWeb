/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {getAuth} from "firebase-admin/auth";
import {log, warn} from "firebase-functions/logger";

import {initializeApp, applicationDefault} from "firebase-admin/app";

import {getMessaging} from "firebase-admin/messaging";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {Stripe} from "stripe";
import {defineSecret} from "firebase-functions/params";

import {onCall, HttpsError, onRequest} from "firebase-functions/https";
import {logger} from "firebase-functions";
import * as geofire from "geofire-common";

const app = initializeApp( {
  credential: applicationDefault(),
  projectId: "osweb-140a8",
});

const isFirestoreEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const firestoreDatabase = isFirestoreEmulator ? "(default)" : "travelingsalesman";
const db = getFirestore(app, firestoreDatabase);


const messaging = getMessaging();

const stripeSecret = defineSecret("STRIPE_SECRET_KEY");
const endpointSecret = defineSecret("STRIPE_ENDPOINT_SECRET");
const endpointSecretCheckoutHook = defineSecret("STRIPE_ENDPOINT_SECRET_CHECKOUT_HOOK");

const googleRoutesApiKey = defineSecret("GOOGLE_ROUTES_API_KEY");


// Function to create a new connected account in Stripe.
export const createConnectedAccount = onCall(
    {secrets: ["STRIPE_SECRET_KEY"]},
    async (request) => {
      const companyName = request.data.companyName;
      if (!companyName) {
        throw new HttpsError("invalid-argument", "The function must be called with a company name.");
      }

      const email = request.data.email;
      if (!email) {
        throw new HttpsError("invalid-argument", "The function must be called with an email.");
      }


      const secretKey = stripeSecret.value();
      const stripe = new Stripe(secretKey);

      // Create a Connect account with the specified controller properties
      const account = await stripe.v2.core.accounts.create({
        display_name: companyName,
        contact_email: email,
        dashboard: "full",
        defaults: {
          responsibilities: {
            fees_collector: "stripe",
            losses_collector: "stripe",
          },
        },
        metadata: {
          tsp_uid: request.auth.uid || "unknown",
          geo_location: request.data.geoLocation || "unknown",
          geo_code: request.data.geoCode || "unknown",
        },
        identity: {
          country: "US",
          entity_type: "company",
          business_details: {
            registered_name: companyName,
          },
        },
        configuration: {
          merchant: {
            capabilities: {
              card_payments: {requested: true},
            },
          },
          customer: {
            capabilities: {
              automatic_indirect_tax: {requested: true},
            },
          },
        },
        include: [
          "configuration.merchant",
          "configuration.customer",
          "identity",
          "defaults",
        ],
      });

      // Store account information in Firestore keyed by Stripe account ID
      const userId = request.auth.uid;
      await db.collection("stripeAccounts").doc(account.id).set({
        userId,
        companyName: companyName,
        email: email,
        createdAt: new Date(),
        status: "pending",
      }, {merge: true});

      log(`Stripe account created for user ${userId}: ${account.id}`);

      return {accountId: account.id};
    });

export const loadStripeData = onCall(
    {secrets: ["STRIPE_SECRET_KEY"]},

    async (request) => {
      const secretKey = stripeSecret.value();
      const stripe = new Stripe(secretKey);

      const appliedConfigurations = request.data?.appliedConfigurations ?? request.data?.applied_configurations;
      const listParams = {
        limit: 20,
      };

      if (appliedConfigurations !== undefined) {
        listParams.applied_configurations = appliedConfigurations;
      }

      const accounts = await stripe.v2.core.accounts.list(listParams);

      for (const account of accounts.data) {
        const accountData = account;

        if (!account.metadata || !account.metadata.tsp_uid) {
          try {
            if (account.contact_email) {
              const userRecord = await getAuth().getUserByEmail(account.contact_email);
              accountData.userId = userRecord.uid;
            } else {
              warn("Skipping getUserByEmail: missing contact_email", {accountId: account.id});
            }
          } catch (error) {
            warn("Failed getUserByEmail in listConnectedAccounts", {
              accountId: account.id,
              contactEmail: account.contact_email || "unknown",
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } else {
          accountData.userId = account.metadata.tsp_uid;
        }

        const hasMerchantConfiguration =
          Array.isArray(account.applied_configurations) ?
            account.applied_configurations.includes("merchant") :
            account.applied_configurations?.merchant === true;

        await db.collection("stripeAccounts").doc(account.id).set(accountData, {merge: true});

        if (hasMerchantConfiguration) {
          const merchantData = {
            ...accountData,
          };

          if (accountData.metadata && accountData.metadata.geo_lat && accountData.metadata.geo_lng) {
            const lat = parseFloat(accountData.metadata.geo_lat);
            const lng = parseFloat(accountData.metadata.geo_lng);
            const hash = geofire.geohashForLocation([lat, lng]);
            merchantData.geohash = hash;
          }
          await db.collection("merchants").doc(account.id).set(merchantData, {merge: true});
        }

        const prodListParams = {
          active: true,
          limit: 100,
        };
        const options = {
          stripeAccount: account.id,
        };

        const accountDisplayName = account.display_name || "Unknown vendor";

        const products = await stripe.products.list(prodListParams, options);

        for (const product of products.data) {
          if (account.id) {
            product.accountId = account.id;
          }
          if (accountDisplayName) {
            product.accountDisplayName = accountDisplayName;
          }
          const userId = product.metadata?.tsp_uid || "unknown";
          if (userId && userId !== "unknown") {
            product.userId = userId;
          }
          if (product.metadata && product.metadata.geo_lat && product.metadata.geo_lng) {
            const lat = parseFloat(product.metadata.geo_lat);
            const lng = parseFloat(product.metadata.geo_lng);
            const hash = geofire.geohashForLocation([lat, lng]);
            product.geohash = hash;
            product.lat = lat;
            product.lng = lng;
          }
          await db.collection("products").doc(product.id).set(product, {merge: true});
        }

        const prices = await stripe.prices.list({
          active: true,
          limit: 100,
        }, options);

        for (const price of prices.data) {
          const userId = price.metadata?.tsp_uid || "unknown";
          if (userId && userId !== "unknown") {
            price.userId = userId;
          }
          await db.collection("prices").doc(price.id).set(price, {merge: true});
        }

        const sessions = await stripe.checkout.sessions.list({
          status: "open",
          limit: 50,
        }, options);
        for (const session of sessions.data) {
          await db.collection("checkoutSessions").doc(session.id).set(session, {merge: true});
        }
      }

      return {accounts: accounts.data};
    });

export const listConnectedAccounts = onCall(
    {secrets: ["STRIPE_SECRET_KEY"]},
    async (request) => {
      const secretKey = stripeSecret.value();
      const stripe = new Stripe(secretKey);

      const appliedConfigurations = request.data?.appliedConfigurations ?? request.data?.applied_configurations;
      const acctListParams = {
        limit: 20,
      };

      if (appliedConfigurations !== undefined) {
        acctListParams.applied_configurations = appliedConfigurations;
      }

      const accounts = await stripe.v2.core.accounts.list(acctListParams);

      // Store account information in Firestore
      for (const account of accounts.data) {
        const accountData = account;

        if (!account.metadata || !account.metadata.tsp_uid) {
          try {
            if (account.contact_email) {
              const userRecord = await getAuth().getUserByEmail(account.contact_email);
              accountData.userId = userRecord.uid;
            } else {
              warn("Skipping getUserByEmail: missing contact_email", {accountId: account.id});
            }
          } catch (error) {
            warn("Failed getUserByEmail in listConnectedAccounts", {
              accountId: account.id,
              contactEmail: account.contact_email || "unknown",
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } else {
          accountData.userId = account.metadata.tsp_uid;
        }

        const hasMerchantConfiguration =
          Array.isArray(account.applied_configurations) ?
            account.applied_configurations.includes("merchant") :
            account.applied_configurations?.merchant === true;

        await db.collection("stripeAccounts").doc(account.id).set(accountData, {merge: true});

        if (hasMerchantConfiguration) {
          const merchantData = {
            ...accountData,
          };

          await db.collection("merchants").doc(account.id).set(merchantData, {merge: true});
        }
      }

      return {accounts: accounts.data};
    });

export const createAccountLink = onCall(
    {secrets: ["STRIPE_SECRET_KEY"]},
    async (request) => {
      const secretKey = stripeSecret.value();
      const stripe = new Stripe(secretKey);
      const accountId = request.data.accountId;
      const url = `${process.env.DOMAIN}`;

      logger.log("Creating account link for account:", accountId);
      logger.log("Using URL for account link:", url);
      const accountLink = await stripe.v2.core.accountLinks.create({
        account: accountId,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            configurations: ["merchant", "customer"],
            refresh_url: url,
            return_url: url,
          },
        },
      });

      return {url: accountLink.url};
    });

export const getAccountStatus = onCall(
    {secrets: ["STRIPE_SECRET_KEY"]},
    async (request) => {
      const accountId = request.data.accountId;

      const secretKey = stripeSecret.value();
      const stripe = new Stripe(secretKey);

      const account = await stripe.v2.core.accounts.retrieve(accountId, {
        include: ["requirements", "configuration.merchant"],
      });

      const payoutsEnabled = account.configuration?.merchant?.capabilities?.stripe_balance?.payouts?.status === "active";
      const chargesEnabled = account.configuration?.merchant?.capabilities?.card_payments?.status === "active";

      // No pending requirments
      const summaryStatus = account.requirements?.summary?.minimum_deadline?.status;
      const detailsSubmitted = !summaryStatus || summaryStatus === "eventually_due";

      const resultData = {
        payoutsEnabled: payoutsEnabled,
        chargesEnabled: chargesEnabled,
        detailsSubmitted: detailsSubmitted,
        // summaryStatus: summaryStatus,
      };
      // Persist account status to Firestore account collection
      await db.collection("stripeAccounts").doc(account.id).set(resultData, {merge: true});

      return resultData;
    });

export const createProduct = onCall(
    {secrets: ["STRIPE_SECRET_KEY"]},
    async (request) => {
      const name = request.data.name;
      if (!name) {
        throw new HttpsError("invalid-argument", "The function must be called with a product name.");
      }
      const description = request.data.description;
      if (!description) {
        throw new HttpsError("invalid-argument", "The function must be called with a product description.");
      }
      const price = request.data.price;
      if (!price) {
        throw new HttpsError("invalid-argument", "The function must be called with a product price.");
      }
      const currency = request.data.currency || "usd";
      const recurring = request.data.recurring === true;
      const recurringInterval = request.data.recurringInterval || "month";
      const allowedIntervals = new Set(["day", "week", "month", "year"]);
      if (recurring && !allowedIntervals.has(recurringInterval)) {
        throw new HttpsError("invalid-argument", "Invalid recurring interval. Allowed values: day, week, month, year.");
      }
      const accountId = request.data.accountId;
      if (!accountId) {
        throw new HttpsError("invalid-argument", "The function must be called with a Stripe account ID.");
      }

      const secretKey = stripeSecret.value();
      const stripe = new Stripe(secretKey);

      // Fetch the Stripe account to get display name
      const account = await stripe.v2.core.accounts.retrieve(accountId);
      const accountDisplayName = account.display_name || "Unknown vendor";

      const product = await stripe.products.create({
        name: name,
        description: description,
        metadata: {
          tsp_uid: request.auth.uid || "unknown",
        },
      }, {
        stripeAccount: accountId,
      });

      if (accountId) {
        product.accountId = accountId;
      }

      if (accountDisplayName) {
        product.accountDisplayName = accountDisplayName;
      }

      const userId = request.auth.uid;
      if (userId) {
        product.userId = userId;
      }

      await db.collection("products").doc(product.id).set(product, {merge: true});

      const priceCreateData = {
        product: product.id,
        unit_amount: Math.round(price * 100), // price in cents
        currency: currency,
        metadata: {
          tsp_uid: request.auth.uid || "unknown",
        },
      };

      if (recurring) {
        priceCreateData.recurring = {
          interval: recurringInterval,
        };
      }

      const priceData = await stripe.prices.create(priceCreateData, {
        stripeAccount: accountId,
      });

      if (userId) {
        priceData.userId = userId;
      }

      await db.collection("prices").doc(priceData.id).set(priceData, {merge: true});


      return {productId: product.id, priceId: priceData.id};
    });

export const updateProduct = onCall(
    {secrets: ["STRIPE_SECRET_KEY"]},
    async (request) => {
      const productId = request.data.productId;
      if (!productId) {
        throw new HttpsError("invalid-argument", "The function must be called with a Stripe product ID.");
      }

      const accountId = request.data.accountId;
      if (!accountId) {
        throw new HttpsError("invalid-argument", "The function must be called with a Stripe account ID.");
      }

      const updateData = {};
      if (typeof request.data.name === "string") {
        updateData.name = request.data.name;
      }
      if (typeof request.data.description === "string") {
        updateData.description = request.data.description;
      }
      if (typeof request.data.url === "string") {
        updateData.url = request.data.url;
      }
      if (typeof request.data.active === "boolean") {
        updateData.active = request.data.active;
      }


      const metadataUpdate = {};
      if (request.data.metadata && typeof request.data.metadata === "object" && !Array.isArray(request.data.metadata)) {
        for (const [key, value] of Object.entries(request.data.metadata)) {
          if (value !== undefined && value !== null) {
            metadataUpdate[key] = String(value);
          }
        }
      }

      let geoCoordinates = null;
      if (request.data.coordinates !== undefined) {
        const lat = Number(request.data.coordinates?.lat);
        const lng = Number(request.data.coordinates?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new HttpsError(
              "invalid-argument",
              "geoCoordinates must include numeric lat and lng values.",
          );
        }

        geoCoordinates = {lat, lng};
        metadataUpdate.geo_lat = String(lat);
        metadataUpdate.geo_lng = String(lng);
      }

      const secretKey = stripeSecret.value();
      const stripe = new Stripe(secretKey);

      const existingProduct = await stripe.products.retrieve(productId, {
        stripeAccount: accountId,
      });

      if (Object.keys(metadataUpdate).length > 0) {
        updateData.metadata = {
          ...(existingProduct.metadata || {}),
          ...metadataUpdate,
        };
      }

      if (Object.keys(updateData).length === 0) {
        throw new HttpsError(
            "invalid-argument",
            "Provide at least one updatable field: name, description, url, active, metadata, or geoCoordinates.",
        );
      }

      let accountDisplayName = "Unknown vendor";
      try {
        const account = await stripe.v2.core.accounts.retrieve(accountId);
        accountDisplayName = account.display_name || "Unknown vendor";
      } catch (error) {
        log(`Unable to fetch account display name for ${accountId}:`, error.message);
      }

      const updatedProduct = await stripe.products.update(productId, updateData, {
        stripeAccount: accountId,
      });

      updatedProduct.accountId = accountId;
      updatedProduct.accountDisplayName = accountDisplayName;

      const userId = updatedProduct.metadata?.tsp_uid;
      if (userId) {
        updatedProduct.userId = userId;
      }

      if (geoCoordinates) {
        updatedProduct.geoCoordinates = geoCoordinates;
      }

      updatedProduct.geohash = geofire.geohashForLocation([updatedProduct.geoCoordinates?.lat, updatedProduct.geoCoordinates?.lng]);
      updatedProduct.lat = updatedProduct.geoCoordinates?.lat;
      updatedProduct.lng = updatedProduct.geoCoordinates?.lng;

      await db.collection("products").doc(updatedProduct.id).set(updatedProduct, {merge: true});

      return {product: updatedProduct};
    });

export const listPrices = onCall(
    {secrets: ["STRIPE_SECRET_KEY"]}, async (request) => {
      const accountId = request.data.accountId;
      const options = {};
      if (accountId) {
        options.stripeAccount = accountId;
      }

      const secretKey = stripeSecret.value();
      const stripe = new Stripe(secretKey);

      const prices = await stripe.prices.list({
        expand: ["data.product"],
        active: true,
        limit: 100,
      });

      for (const price of prices.data) {
        const userId = price.metadata?.tsp_uid || "unknown";
        if (userId && userId !== "unknown") {
          price.userId = userId;
        }
        await db.collection("prices").doc(price.id).set(price, {merge: true});
      }

      return {prices: prices.data};
    });

export const listProducts = onCall(
    {secrets: ["STRIPE_SECRET_KEY"]}, async (request) => {
      const accountId = request.data.accountId;

      const listParams = {
        active: true,
        limit: 100,
      };

      const options = {};
      if (accountId) {
        options.stripeAccount = accountId;
        listParams.options = options;
      }

      const secretKey = stripeSecret.value();
      const stripe = new Stripe(secretKey);

      // Fetch account display name once if accountId is provided
      let accountDisplayName = "Unknown vendor";
      if (accountId) {
        try {
          const account = await stripe.v2.core.accounts.retrieve(accountId);
          accountDisplayName = account.display_name || "Unknown vendor";
        } catch (error) {
          log(`Unable to fetch account display name for ${accountId}:`, error.message);
        }
      }

      const products = await stripe.products.list(listParams);

      for (const product of products.data) {
        if (accountId) {
          product.accountId = accountId;
        }
        if (accountDisplayName) {
          product.accountDisplayName = accountDisplayName;
        }
        const userId = product.metadata?.tsp_uid || "unknown";
        if (userId && userId !== "unknown") {
          product.userId = userId;
        }
        await db.collection("stripeProducts").doc(product.id).set(product, {merge: true});
      }

      return {products: products.data};
    });

export const createCheckoutSession = onCall(
    {secrets: ["STRIPE_SECRET_KEY"]},
    async (request) => {
      const productId = request.data.productId;
      if (!productId) {
        throw new HttpsError("invalid-argument", "The function must be called with a Stripe product ID.");
      }
      const accountId = request.data.accountId;
      if (!accountId) {
        throw new HttpsError("invalid-argument", "The function must be called with a Stripe account ID.");
      }

      const secretKey = stripeSecret.value();
      const stripe = new Stripe(secretKey);

      const prices = await stripe.prices.search({
        query: `active:'true' AND product:'${productId}'`,
      });

      let mode = "payment";
      const lineItems = [];
      for (const price of prices.data) {
        mode = price.type === "recurring" ? "subscription" : "payment";
        lineItems.push({
          price: price.id,
          quantity: 1,
        });
      }
      const session = await stripe.checkout.sessions.create({
        line_items: lineItems,
        mode: mode,
        success_url: `${process.env.DOMAIN}/paid?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.DOMAIN}/cancelled`,
      }, {
        stripeAccount: accountId,
      });

      return {sessionId: session.id, url: session.url};
    });

// Callable function to generate a Stripe payment link for a given request ID.
export const getPaymentLink = onCall(
    {secrets: ["STRIPE_SECRET_KEY"]},
    async (request) => {
      // logger.info("getPaymentLink invoked", {
      //   hasAuth: Boolean(request.auth),
      //   uid: request.auth?.uid || null,
      //   accountId: request.data.accountId || null,
      //   productId: request.data.productId || null,
      //   priceCount: Array.isArray(request.data.prices) ? request.data.prices.length : 0,
      //   hasSuccessUrl: Boolean(request.data.successUrl),
      // });

      const secretKey = stripeSecret.value();
      const stripe = new Stripe(secretKey);
      const accountId = request.data.accountId;
      const prices = Array.isArray(request.data.prices) ? request.data.prices : [];
      const successUrl = request.data.successUrl || `${process.env.DOMAIN}/paid`;

      if (!prices || prices.length === 0) {
        logger.warn("getPaymentLink rejected because no prices were supplied", {
          accountId: accountId || null,
        });
        throw new HttpsError("invalid-argument", "The function must be called with at least one price.");
      }

      const lineItems = prices.map((price) => ({price: price.id, quantity: price.quantity || 1}));

      logger.info("Creating payment link", {
        accountId: accountId || null,
        priceIds: prices.map((price) => price.id),
        lineItems: lineItems,
        successUrl,
      });
      let paymentLink;
      try {
        paymentLink = await stripe.paymentLinks.create({
          line_items: lineItems,
          phone_number_collection: {
            enabled: true,
          },
          after_completion: {
            type: "redirect",
            redirect: {
              url: successUrl,
            },
          },
        }, {
          stripeAccount: accountId,
        });
        logger.info(`Payment link created for account ${accountId}: ${paymentLink.url}`);
      } catch (error) {
        logger.error("Failed to create Stripe payment link", {
          accountId: accountId || null,
          priceIds: prices.map((price) => price.id),
          successUrl,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorType: error?.type || null,
          errorCode: error?.code || null,
        });
        return null;
      }
      return {paymentLink: paymentLink};
    });

// Callable function to create a ride request from form payload.
export const requestRide = onCall({secrets: ["STRIPE_SECRET_KEY"]}, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "You must be signed in to request a ride.");
  }

  const rideNow = request.data.rideNow === true;
  const rideDateTime = request.data.rideDateTime;
  const routeStops = Array.isArray(request.data.routeStops) ? request.data.routeStops : [];
  const distanceMiles = Number(request.data.distancemiles);
  const minutes = Number(request.data.minutes);
  const accountId = typeof request.data.accountId === "string" ? request.data.accountId.trim() : "";
  const productId = typeof request.data.productId === "string" ? request.data.productId.trim() : "";
  const prices = Array.isArray(request.data.prices) ? request.data.prices : [];

  if (!rideNow && !rideDateTime) {
    throw new HttpsError(
        "invalid-argument",
        "The function must be called with rideDateTime or rideNow=true.",
    );
  }

  if (routeStops.length < 1) {
    throw new HttpsError(
        "invalid-argument",
        "The function must be called with at least one route stop.",
    );
  }

  const normalizedStops = routeStops.map((stop) => {
    const label = String(stop?.label || "Stop");
    const address = String(stop?.address || "Unknown address");
    const lat = Number(stop?.lat);
    const lng = Number(stop?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new HttpsError(
          "invalid-argument",
          "Each route stop must include numeric lat/lng coordinates.",
      );
    }

    return {
      source: String(stop?.source || "autocomplete"),
      label,
      address,
      lat,
      lng,
    };
  });

  const pickupStop = normalizedStops[0];
  const dropoffStop = normalizedStops[normalizedStops.length - 1];

  let merchantUid = null;
  let merchantDisplayName = null;
  let merchantEmail = null;

  if (accountId) {
    const merchantDoc = await db.collection("merchants").doc(accountId).get();
    if (!merchantDoc.exists) {
      throw new HttpsError(
          "not-found",
          "No merchant record found for the provided accountId.",
      );
    }

    const merchantData = merchantDoc.data() || {};
    merchantUid = merchantData.userId || merchantData.uid || null;
    merchantDisplayName = merchantData.display_name || merchantData.displayName || null;
    merchantEmail = merchantData.contact_email || merchantData.email || null;
  }

  const createdAt = new Date();
  const rideRequest = {
    user: request.auth.uid,
    productId: productId || null,
    prices: prices,
    createdTS: createdAt,
    updatedTS: createdAt,
    schedule: {
      rideNow,
      rideDateTime: rideNow ? null : rideDateTime,
    },
    routeStops: normalizedStops,
    accountId: accountId || null,
    merchantUid,
    merchantDisplayName,
    merchantEmail,
    pickupAddress: pickupStop.address,
    dropoffAddress: dropoffStop.address,
    A: {
      address: pickupStop.address,
      location: {
        lat: pickupStop.lat,
        lng: pickupStop.lng,
      },
    },
    B: {
      address: dropoffStop.address,
      location: {
        lat: dropoffStop.lat,
        lng: dropoffStop.lng,
      },
    },
    status: "requested",
  };

  if (Number.isFinite(distanceMiles)) {
    rideRequest.distancemiles = Math.round(distanceMiles);
  }

  if (Number.isFinite(minutes)) {
    rideRequest.minutes = minutes;
  }

  const requestRef = await db.collection("requests").add(rideRequest);
  log(`Ride request created for user ${request.auth.uid}: ${requestRef.id}`);

  return {
    requestId: requestRef.id,
    status: rideRequest.status,
  };
});

export const computeRouteEstimate = onCall(
    {secrets: ["GOOGLE_ROUTES_API_KEY"]},
    async (request) => {
      const toLatLng = (stop, fieldName) => {
        const lat = Number(stop?.lat);
        const lng = Number(stop?.lng);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new HttpsError(
              "invalid-argument",
              `${fieldName} must include numeric lat and lng values.`,
          );
        }

        return {
          latitude: lat,
          longitude: lng,
        };
      };

      const toWaypoint = (stop, fieldName) => ({
        location: {
          latLng: toLatLng(stop, fieldName),
        },
      });

      const normalizeScheduleInput = (inputSchedule, fallbackRideNow, fallbackRideDateTime) => {
        const schedule = (inputSchedule && typeof inputSchedule === "object") ? inputSchedule : {};
        const rideNow = schedule.rideNow === true || fallbackRideNow === true;
        const rideDateTime = typeof schedule.rideDateTime === "string" ?
          schedule.rideDateTime :
          (typeof fallbackRideDateTime === "string" ? fallbackRideDateTime : null);

        if (!rideNow && !rideDateTime) {
          throw new HttpsError(
              "invalid-argument",
              "schedule must include rideNow=true or a valid rideDateTime.",
          );
        }

        if (rideNow) {
          return {rideNow: true, departureTime: new Date().toISOString()};
        }

        const parsedDate = new Date(rideDateTime);
        if (Number.isNaN(parsedDate.getTime())) {
          throw new HttpsError(
              "invalid-argument",
              "schedule.rideDateTime must be a valid date/time string.",
          );
        }

        return {rideNow: false, departureTime: parsedDate.toISOString()};
      };

      const buildComputeRoutesBody = (routeData, departureTime) => {
        const route = (routeData && typeof routeData === "object") ? routeData : {};
        const routeStops = Array.isArray(route.routeStops) ? route.routeStops : [];
        const travelMode = typeof route.travelMode === "string" ? route.travelMode : "DRIVE";
        const routingPreference = typeof route.routingPreference === "string" ?
          route.routingPreference :
          "TRAFFIC_AWARE";

        let origin = route.origin;
        let destination = route.destination;
        let intermediates = Array.isArray(route.intermediates) ? route.intermediates : [];

        if ((!origin || !destination) && routeStops.length >= 2) {
          origin = routeStops[0];
          destination = routeStops[routeStops.length - 1];
          intermediates = routeStops.slice(1, -1);
        }

        if (!origin || !destination) {
          throw new HttpsError(
              "invalid-argument",
              "route must include origin and destination, or routeStops with at least two stops.",
          );
        }

        return {
          origin: toWaypoint(origin, "route.origin"),
          destination: toWaypoint(destination, "route.destination"),
          intermediates: intermediates.map((stop, index) => toWaypoint(stop, `route.intermediates[${index}]`)),
          travelMode,
          routingPreference,
          computeAlternativeRoutes: route.computeAlternativeRoutes === true,
          languageCode: typeof route.languageCode === "string" ? route.languageCode : "en-US",
          units: typeof route.units === "string" ? route.units : "IMPERIAL",
          departureTime,
        };
      };


      const scheduleInput = request.data.schedule;
      const normalizedSchedule = normalizeScheduleInput(
          scheduleInput,
          request.data.rideNow,
          request.data.rideDateTime,
      );

      const routeInput = request.data.route || {routeStops: request.data.routeStops};
      const computeRoutesBody = buildComputeRoutesBody(routeInput, normalizedSchedule.departureTime);

      const apiKey = googleRoutesApiKey.value();
      const fieldMask = typeof request.data.fieldMask === "string" && request.data.fieldMask.trim() ?
        request.data.fieldMask.trim() :
        "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs";

      const apiResponse = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify(computeRoutesBody),
      });

      const responseText = await apiResponse.text();
      const responseData = responseText ? JSON.parse(responseText) : {};

      if (!apiResponse.ok) {
        const message = responseData?.error?.message ||
          `Google Routes API request failed with status ${apiResponse.status}.`;

        throw new HttpsError("internal", message, {
          status: apiResponse.status,
          details: responseData?.error || null,
        });
      }

      const routes = Array.isArray(responseData.routes) ? responseData.routes : [];

      return {
        schedule: normalizedSchedule,
        request: computeRoutesBody,
        routes,
        raw: responseData,
      };
    },
);

export const createRequest =
  onDocumentCreated({document: "requests/{requestId}", database: firestoreDatabase}, async (event) => {
    const request = event.params.requestId;
    log("New request: " + request);

    const snapshot = event.data;
    if (!snapshot) {
      log("No data associated with the event");
      return;
    }
    const data = snapshot.data();

    log("Request user: " + data.user);

    const driverCollection = db.collection("drivers");
    const driverDocRefs = await driverCollection.listDocuments();
    if (driverDocRefs.length === 0) {
      log("There are no drivers to send notifications to.");
      return;
    }
    const tokens = await db.getAll(...driverDocRefs);

    // Get the user's phone number from Firebase Authentication
    // and update the request document with it.
    const auth = getAuth();
    const userProfile = await auth.getUser(data.user);
    event.data.ref.set({phoneNumber: userProfile.phoneNumber ?? "unknown"}, {merge: true});

    const notification = {
      title: "You have a new request.",
      body: (userProfile.phoneNumber ?? "Someone") +
              " requested a ride.",
      image: userProfile.photoURL ?? "",
    };

    // Send notifications to all tokens.
    const messages = [];

    tokens.forEach((doc) => {
      messages.push({
        token: doc.data().fcmToken,
        notification: notification,
      });
    });

    const batchResponse = await messaging.sendEach(messages);

    if (batchResponse.failureCount < 1) {
      // Messages sent sucessfully. We're done!
      log("Messages sent.");
      return;
    }
    warn(`${batchResponse.failureCount} messages weren't sent.`,
        batchResponse);
  });

// Triggered when a new chat message is created in Firestore.
export const chatMessageCreated = onDocumentCreated(
    {document: "contactMessages/{messageId}", database: firestoreDatabase},
    async (event) => {
      const messageId = event.params.messageId;
      log("New chat message: " + messageId);

      const snapshot = event.data;
      if (!snapshot) {
        log("No data associated with the chat message event");
        return;
      }

      const data = snapshot.data();
      if (!data) {
        log("Chat message has no data");
        return;
      }

      const sessionId = data.sessionId;
      if (!sessionId) {
        log("Chat message missing sessionId");
        return;
      }
      // uid of sender of the message
      const messageSenderId = data.senderId || null;

      try {
        // first get the token from chat session document, then send notification to that token
        const sessionRef = db.collection("chatSessions").doc(sessionId);
        const sessionSnap = await sessionRef.get();
        if (!sessionSnap.exists) {
          log(`No chat session found for ${sessionId}`);
          return;
        }
        sessionRef.set({
          updatedAt: Timestamp.now(),
          lastMessageText: data.text || "",
          lastMessageSenderId: messageSenderId || null,
        }, {merge: true});

        // uid of the user who owns the session
        const sessionData = sessionSnap.data() || {};
        const sessionUserUid = sessionData.userUid || null;

        // Send notification to all tokens.
        const fids = [];

        // If the message sender is the same as the session owner, do not send a notification.
        if (messageSenderId && sessionUserUid && messageSenderId === sessionUserUid) {
          log(`Message ${messageId} originated from session owner; skipping notification.`);
        } else {
          const token = sessionData.notificationToken || null;
          if (token) {
            fids.push(token);
            sessionRef.set({
              lastMessageSenderId: messageSenderId || null,
            }, {merge: true});
          }
        }

        // Get all admin tokens and send notifications to them as well.
        const adminCollection = db.collection("admin");
        const adminDocRefs = await adminCollection.listDocuments();
        if (adminDocRefs.length === 0) {
          log("There are no admins to send notifications to.");
        } else {
          const adminDocs = await db.getAll(...adminDocRefs);
          adminDocs.forEach((doc) => {
            if (doc.exists && doc.data().fcmToken) {
              fids.push(doc.data().fcmToken);
            }
          });
          log(`Sending chat message notification to ${adminDocRefs.length} admins.`);
        }

        if (fids.length === 0) {
          log("No notification tokens found for chat message.");
          return;
        }

        const notificationPayload = {
          fids: fids,
          tokens: fids,
          data: {
            body: data.text ? String(data.text).slice(0, 240) : "",
            title: "Traveling Salesman support message",
            sessionId: String(sessionId),
            messageId: String(messageId),
          },
        };

        const batchResponse = await messaging.sendEachForMulticast(notificationPayload);

        if (batchResponse.failureCount < 1) {
          // Messages sent sucessfully. We're done!
          log(`${batchResponse.successCount} messages sent.`);
          return;
        }
        warn(`Notification sent for message ${messageId}: ${batchResponse.successCount} successful, ${batchResponse.failureCount} failed.`);
      } catch (err) {
        warn("Failed to send chat message notification:", err);
      }
    },
);

/**
 * Creates Stripe checkout artifacts for an existing ride request.
 * @param {string} requestId Firestore request document ID.
 * @return {Promise<{requestId: string, paymentLink: string, sessionUrl: string, checkoutSessionId: string}>}
 */
async function createRequestPricing(requestId) {
  const normalizedRequestId = typeof requestId === "string" ? requestId.trim() : "";
  if (!normalizedRequestId) {
    throw new HttpsError("invalid-argument", "The function must be called with a requestId.");
  }

  const requestRef = db.collection("requests").doc(normalizedRequestId);
  const requestSnapshot = await requestRef.get();
  if (!requestSnapshot.exists) {
    throw new HttpsError("not-found", `No request found with ID: ${normalizedRequestId}`);
  }

  const data = requestSnapshot.data() || {};
  if (!("accountId" in data) || !("productId" in data) || !("prices" in data) ||
    !Array.isArray(data.prices) || data.prices.length === 0) {
    throw new HttpsError(
        "failed-precondition",
        "The request must include accountId, productId, and at least one price.",
    );
  }

  log(`Request ${normalizedRequestId} has new prices: ${JSON.stringify(data.prices)}`);

  const secretKey = stripeSecret.value();
  const stripe = new Stripe(secretKey);

  const lineItems = data.prices.map((price) => ({
    price: price.id,
    quantity: price.quantity || 1,
  }));

  let mode = "payment";
  for (const price of data.prices) {
    if (price.type === "recurring") {
      mode = "subscription";
      break;
    }
  }

  const successUrl = `${process.env.DOMAIN}/request-details?requestId=${encodeURIComponent(normalizedRequestId)}&paid=true`;
  const cancelUrl = `${process.env.DOMAIN}/request-details?requestId=${encodeURIComponent(normalizedRequestId)}&paid=false`;

  const session = await stripe.checkout.sessions.create({
    line_items: lineItems,
    phone_number_collection: {
      enabled: true,
    },
    mode: mode,
    success_url: successUrl,
    cancel_url: cancelUrl,
  }, {
    stripeAccount: data.accountId,
  });

  await requestRef.set({sessionUrl: session.url, checkoutSessionId: session.id}, {merge: true});

  return {
    requestId: normalizedRequestId,
    sessionUrl: session.url,
    checkoutSessionId: session.id,
  };
}

export const priceRequest = onCall(
    {secrets: ["STRIPE_SECRET_KEY"]},
    async (request) => createRequestPricing(request.data?.requestId),
);

export const getCheckoutSession = onCall(
    {secrets: ["STRIPE_SECRET_KEY"]},
    async (request) => {
      const accountId = request.data?.accountId;
      const checkoutSessionId = request.data?.checkoutSessionId;

      if (!accountId) {
        throw new HttpsError("invalid-argument", "The function must be called with an accountId.");
      }

      if (!checkoutSessionId) {
        throw new HttpsError("invalid-argument", "The function must be called with a checkoutSessionId.");
      }

      const secretKey = stripeSecret.value();
      const stripe = new Stripe(secretKey);

      // Retrieve the checkout session from Stripe
      const session = await stripe.checkout.sessions.retrieve(
          checkoutSessionId,
          {stripeAccount: accountId},
      );

      if (!session) {
        throw new HttpsError("not-found", `Checkout session ${checkoutSessionId} not found.`);
      }

      // Store the session in Firestore
      const sessionData = {
        id: session.id,
        accountId: accountId,
        status: session.status,
        customer: session.customer,
        customer_email: session.customer_email,
        payment_status: session.payment_status,
        amount_total: session.amount_total,
        currency: session.currency,
        created: session.created ? new Date(session.created * 1000) : null,
        expires_at: session.expires_at ? new Date(session.expires_at * 1000) : null,
        mode: session.mode,
        payment_intent: session.payment_intent,
        line_items: session.line_items,
        metadata: session.metadata,
        retrievedAt: Timestamp.now(),
      };

      await db.collection("checkoutsessions").doc(session.id).set(sessionData, {merge: true});

      log(`Checkout session ${checkoutSessionId} retrieved and stored for account ${accountId}`);

      return {
        sessionId: session.id,
        status: session.status,
        paymentStatus: session.payment_status,
      };
    },
);

export const expireCheckoutSession = onCall(
    {secrets: ["STRIPE_SECRET_KEY"]},
    async (request) => {
      const accountId = request.data?.accountId;
      const checkoutSessionId = request.data?.checkoutSessionId;

      if (!accountId) {
        throw new HttpsError("invalid-argument", "The function must be called with an accountId.");
      }

      if (!checkoutSessionId) {
        throw new HttpsError("invalid-argument", "The function must be called with a checkoutSessionId.");
      }

      const secretKey = stripeSecret.value();
      const stripe = new Stripe(secretKey);

      // Expire the checkout session
      const expiredSession = await stripe.checkout.sessions.expire(
          checkoutSessionId,
          {stripeAccount: accountId},
      );

      if (!expiredSession) {
        throw new HttpsError("not-found", `Checkout session ${checkoutSessionId} not found.`);
      }

      // Update the session status in Firestore
      await db.collection("checkoutsessions").doc(expiredSession.id).set({
        status: expiredSession.status,
        expires_at: expiredSession.expires_at ? new Date(expiredSession.expires_at * 1000) : null,
        updatedAt: Timestamp.now(),
      }, {merge: true});

      log(`Checkout session ${checkoutSessionId} expired for account ${accountId}`);

      return {
        sessionId: expiredSession.id,
        status: expiredSession.status,
      };
    },
);

export const accountCreated = onRequest( {secrets: ["STRIPE_SECRET_KEY", "STRIPE_ENDPOINT_SECRET"]},

    (request, response) => {
      let event = request.body;

      const secretKey = stripeSecret.value();
      const stripe = new Stripe(secretKey);

      const endpointSecretKey = endpointSecret.value();

      // Only verify the event if you have an endpoint secret defined.
      // Otherwise use the basic event deserialized with JSON.parse
      if (endpointSecretKey) {
        // Get the signature sent by Stripe
        const signature = request.headers["stripe-signature"];
        try {
          event = stripe.webhooks.constructEvent(
              request.rawBody,
              signature,
              endpointSecretKey,
          );
        } catch (err) {
          log(`⚠️  Webhook signature verification failed.`, err.message);
          return response.sendStatus(400);
        }
      } else {
        event = JSON.parse(request.body);
      }


      // Handle the event
      switch (event.type) {
        case "payment_intent.succeeded":
          // const paymentIntent = event.data.object;
          // console.log(`PaymentIntent for ${paymentIntent.amount} was successful!`);
          // Then define and call a method to handle the successful payment intent.
          // handlePaymentIntentSucceeded(paymentIntent);
          break;
        case "payment_method.attached":
          // const paymentMethod = event.data.object;
          // Then define and call a method to handle the successful attachment of a PaymentMethod.
          // handlePaymentMethodAttached(paymentMethod);
          break;
        default:
          // Unexpected event type
          log(`Unhandled event type ${event.type}.`);
      }

      response.status(200).send();
    },
);

export const checkoutSessionHook = onRequest( {secrets: ["STRIPE_SECRET_KEY", "STRIPE_ENDPOINT_SECRET_CHECKOUT_HOOK"]},
    (request, response) => {
      let event = request.body;

      const secretKey = stripeSecret.value();
      const stripe = new Stripe(secretKey);

      const endpointSecretKey = endpointSecretCheckoutHook.value();

      // Only verify the event if you have an endpoint secret defined.
      // Otherwise use the basic event deserialized with JSON.parse
      if (endpointSecretKey) {
        // Get the signature sent by Stripe
        const signature = request.headers["stripe-signature"];
        try {
          event = stripe.webhooks.constructEvent(
              request.rawBody,
              signature,
              endpointSecretKey,
          );
        } catch (err) {
          log(`⚠️  Webhook signature verification failed.`, err.message);
          return response.sendStatus(400);
        }
      } else {
        event = JSON.parse(request.body);
      }

      // Handle the event
      let session;
      let status;
      switch (event.type) {
        case "checkout.session.completed":
          session = event.data.object;
          status = session.payment_status;
          log(`Checkout session completed for session ID: ${session.id} with payment status: ${status}`);
          // Then define and call a method to handle the successful checkout session.
          // handleCheckoutSessionCompleted(session);
          break;
        default:
          // Unexpected event type
          log(`Unhandled event type ${event.type}.`);
      }

      response.status(200).send();
    },
);
