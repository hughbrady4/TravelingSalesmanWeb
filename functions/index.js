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
import {log} from "firebase-functions/logger";

import {initializeApp} from "firebase-admin/app";

import {getMessaging} from "firebase-admin/messaging";

initializeApp();

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

    log("Request data: " + data.user);


    const auth = getAuth();
    const userProfile = await auth.getUser(data.user);

    log("Request user: " + userProfile.toJSON());


    const notification = {
      title: "You have a new request.",
      body: (userProfile.phoneNumber ?? "Someone") +
              " requested a ride.",
      image: userProfile.photoURL ?? "",
    };

    // Send notifications to all tokens.
    const messages = {
      token: "eV4Oa0PsRwOtpPFy3wU4TL:APA91bG3EsU5p0A-RsKbe7PzzzuAdwafaJ8TtDXvAGFyM5dgRY2v89Ry-MiCGyyII9yPRBZVoU3mWCrb18cQky6l-dgTzPdRVppZqUURbKXYItZhn5XoaR8",
      notification: notification,
    };

    await messaging.send(messages);

    log("Request FCM sent!");
  });
