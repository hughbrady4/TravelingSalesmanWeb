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

import {initializeApp} from "firebase-admin/app";

import {getMessaging} from "firebase-admin/messaging";
import {getFirestore} from "firebase-admin/firestore";

initializeApp();

const db = getFirestore();

const messaging = getMessaging();

export const createRequest =
  onDocumentCreated("requests/{requestId}", async (event) => {
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
