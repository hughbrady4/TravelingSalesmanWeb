/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */
import {onDocumentCreated, onDocumentUpdated} from "firebase-functions/v2/firestore";
import {getAuth} from "firebase-admin/auth";
import {log, warn} from "firebase-functions/logger";

import {initializeApp, applicationDefault} from "firebase-admin/app";

import {getMessaging} from "firebase-admin/messaging";
import {getFirestore} from "firebase-admin/firestore";
import {Stripe} from "stripe";
import {defineSecret} from "firebase-functions/params";

import {onCall, HttpsError, onRequest} from "firebase-functions/https";
import {logger} from "firebase-functions";

const app = initializeApp( {
  credential: applicationDefault(),
  projectId: "osweb-140a8",
});

const db = getFirestore(app, "travelingsalesman");

const messaging = getMessaging();

const stripeSecret = defineSecret("STRIPE_SECRET_KEY");
const endpointSecret = defineSecret("STRIPE_ENDPOINT_SECRET");


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

export const createAccountLink = onCall(
    {secrets: ["STRIPE_SECRET_KEY"]},
    async (request) => {
      const accountId = request.data.accountId;

      const secretKey = stripeSecret.value();
      const stripe = new Stripe(secretKey);

      const accountLink = await stripe.v2.core.accountLinks.create({
        account: accountId,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            configurations: ["merchant", "customer"],
            refresh_url: "https://travelingsalesman.web.app",
            return_url: `https://travelingsalesman.web.app`,
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

      const resultData = account.toJSON();
      resultData.payoutsEnabled = payoutsEnabled;
      resultData.chargesEnabled = chargesEnabled;
      resultData.detailsSubmitted = detailsSubmitted;

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
      const description = request.data.descriptio;
      if (!description) {
        throw new HttpsError("invalid-argument", "The function must be called with a product description.");
      }
      const price = request.data.price;
      if (!price) {
        throw new HttpsError("invalid-argument", "The function must be called with a product price.");
      }
      const currency = request.data.currency || "usd";
      const accountId = request.data.accountId;
      if (!accountId) {
        throw new HttpsError("invalid-argument", "The function must be called with a Stripe account ID.");
      }

      const secretKey = stripeSecret.value();
      const stripe = new Stripe(secretKey);

      const product = await stripe.products.create({
        name: name,
        description: description,
      }, {
        stripeAccount: accountId,
      });

      const priceData = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(price * 100), // price in cents
        currency: currency,
      }, {
        stripeAccount: accountId,
      });

      return {productId: product.id, priceId: priceData.id};
    });

export const listProducts = onCall(
    {secrets: ["STRIPE_SECRET_KEY"]}, async (request) => {
      const accountId = request.data.accountId;
      const options = {};
      if (accountId) {
        options.stripeAccount = accountId;
      }

      const secretKey = stripeSecret.value();
      const stripe = new Stripe(secretKey);

      const products = await stripe.products.list({
        expand: ["data.product"],
      }, options);

      return {products: products.data};
    });

export const createCheckoutSession = onCall(
    {secrets: ["STRIPE_SECRET_KEY"]},
    async (request) => {
      const priceId = request.data.priceId;
      if (!priceId) {
        throw new HttpsError("invalid-argument", "The function must be called with a Stripe price ID.");
      }
      const accountId = request.data.accountId;
      if (!accountId) {
        throw new HttpsError("invalid-argument", "The function must be called with a Stripe account ID.");
      }

      const secretKey = stripeSecret.value();
      const stripe = new Stripe(secretKey);

      const price = await stripe.prices.retrieve(priceId, {
        stripeAccount: accountId,
      });

      const priceType = price.type;
      const mode = priceType === "recurring" ? "subscription" : "payment";

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: mode,
        success_url: `${process.env.DOMAIN}/paid?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.DOMAIN}/cancelled`,
      }, {
        stripeAccount: accountId,
      });

      return {sessionId: session.id, url: session.url};
    });

// Callable function to generate a Stripe payment link for a given request ID.
export const getPaymentLink = onCall(async (request) => {
  const requestId = request.data.id;
  const price = request.data.price;

  if (!requestId) {
    throw new HttpsError("invalid-argument", "The function must be called with a requestId.");
  }

  if (!price) {
    throw new HttpsError("invalid-argument", "The function must be called with a price.");
  }

  const requestDoc = await db.collection("requests").doc(requestId).get();

  if (!requestDoc.exists) {
    throw new HttpsError("not-found", `No request found with ID: ${requestId}`);
  }

  const secretKey = stripeSecret.value();

  const stripe =
    new Stripe(secretKey, {
      apiVersion: "2022-11-15",
    });

  const paymentLink = await stripe.paymentLinks.create({line_items: [
    {
      price_data: {
        currency: "usd",
        product_data: {
          name: `Ride Request`,
          description: `Pickup: ${requestDoc.data().pickupAddress || "unknown"}\n, 
            Dropoff: ${requestDoc.data().dropoffAddress || "unknown"}`,
        },
        unit_amount: Math.round(price * 100), // price in cents
      },
      quantity: 1,
    },
  ],
  });

  logger.info(`Payment link created for request ${requestId}: ${paymentLink.url}`);

  await requestDoc.ref.set({price: price, paymentLink: paymentLink.url}, {merge: true});

  return {paymentLink: paymentLink.url};
});

export const createRequest =
  onDocumentCreated({document: "requests/{requestId}", database: "travelingsalesman"}, async (event) => {
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
    {document: "contactMessages/{messageId}", database: "travelingsalesman"},
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

      try {
        const sessionRef = db.collection("chatSessions").doc(sessionId);
        const sessionSnap = await sessionRef.get();
        if (!sessionSnap.exists) {
          log(`No chat session found for ${sessionId}`);
          return;
        }

        const sessionData = sessionSnap.data() || {};
        const messageSenderId = data.senderId || null;
        const sessionUserUid = sessionData.userUid || null;

        // If the message sender is the same as the session owner, do not send a notification.
        if (messageSenderId && sessionUserUid && messageSenderId === sessionUserUid) {
          log(`Message ${messageId} originated from session owner; skipping notification.`);
          return;
        }

        const token = sessionData.notificationToken || null;
        if (!token) {
          log(`No notification token for session ${sessionId}`);
          return;
        }

        const notificationPayload = {
          token: token,
          data: {
            body: data.text ? String(data.text).slice(0, 240) : "",
            title: "New support message",
            sessionId: String(sessionId),
            messageId: String(messageId),
          },
        };

        const response = await messaging.send(notificationPayload);
        log(`Notification sent for message ${messageId}: ${response}`);
      } catch (err) {
        warn("Failed to send chat message notification:", err);
      }
    },
);


export const requestUpdated =
    onDocumentUpdated({document: "requests/{requestId}", database: "travelingsalesman"}, async (event) => {
      const requestId = event.params.requestId;
      log("Request updated: " + requestId);

      const afterSnapshot = event.data.after;
      if (!afterSnapshot) {
        log("No data associated with the event");
        return;
      }

      const data = afterSnapshot.data();
      const beforeData = event.data.before?.data() || {};

      if ("price" in data && data.price !== beforeData.price && !("paymentLink" in data)) {
        log(`Request ${requestId} has new price: ${data.price}`);
        // Here you could add additional logic, such as notifying the user about the price update.

        const secretKey = stripeSecret.value();

        const stripe =
          new Stripe(secretKey, {
            apiVersion: "2022-11-15",
          });

        const paymentLink = await stripe.paymentLinks.create({line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Ride Request ${data.phone | data.userPhone}`,
              },
              unit_amount: Math.round(data.price * 100), // price in cents
            },
            quantity: 1,
          },
        ],
        });


        await afterSnapshot.ref.set({paymentLink: paymentLink.url}, {merge: true});
        log(`Payment link created for request ${requestId}: ${paymentLink.url}`);
      }
    });

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
