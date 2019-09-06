  const functions = require('firebase-functions');
  const admin = require('firebase-admin');

  //Initialize the admin sdk
  admin.initializeApp()

  //Basic http callable firebase function
  exports.helloWorld = functions.https.onRequest((request, response) => {
      console.log(request.body.data.name)
      response.send({
          "data": {
              "message": `Hello, ${request.body.data.name}!`
          }
      });
  });

  exports.addWelcomeMessage = functions.auth.user().onCreate(async (user) => {
    console.log('A new user signed In')
    const fullName = user.displayName || 'Anonymous'

    await admin.firestore().collection('messages').add({
      uid:0,
      name: 'Firebase Bot',
      profilePicUrl: '/images/firebase-logo.png',
      text: `${fullName} signed in for the first time! Welcome!`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  })

  exports.indicateImageUri = functions.runWith({memory: '1GB'}).storage.object().onFinalize(async (object) => {
    console.log("An image has been stored!")
  })

  exports.sendNotification = functions.firestore.document('messages/{messageId}').onCreate(async (newMessage) => {
    console.log("**** HELLLLLLO *********")
    console.log(newMessage.data())
    const text = newMessage.data().text
    const payload = {
      "notification": {
        title: `${newMessage.data().name} posted ${text ? 'a message' : 'an image'}`,
        body: text ? (text.length <= 100 ? text : text.substring(0, 97) + '...') : '',
        icon: newMessage.data().profilePicUrl || '/images/profile_placeholder.png',
        click_action: `https://${process.env.GCLOUD_PROJECT}.firebaseapp.com`,
      }
    }

    const allTokens = await admin.firestore().collection('fcmTokens').get()
    const currentUserId = newMessage.data().uid
    const tokens = allTokens.docs.filter((currentToken) => {
      console.log("From filter---")
      console.log(currentUserId)
      console.log(currentToken.get('uid'))
      return currentUserId !== currentToken.get('uid')
    }).map((currentToken) => currentToken.id)
    console.log("******** TOKENS **********", tokens)
    if(tokens.length > 0) {
      const response = await admin.messaging().sendToDevice(tokens, payload)
      const deletedTokens = await cleanupTokens(response, tokens)
      console.log("** Deleted tokens in send Notification **")
      console.log(deletedTokens)
      console.log('Notify payload sent')
    }
  })

  function cleanupTokens(response, tokens) {
    const tokensToDelete = []
    response.results.forEach((result, index) => {
      const error = result.error
      if(error) {
        console.error('Failure sending notification to', tokens[index], error);
        console.error(error.code)
        // Cleanup the tokens who are not registered anymore.
        if (error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered') {
          console.log("Attempting to Delete token:- ", index, tokens[index])
          const deleteTask = admin.firestore().collection('fcmTokens').doc(tokens[index]).delete();
          console.log("** Current Token marked as deleted in clean up **")
          console.log(deleteTask)
          tokensToDelete.push(deleteTask);
        }
      }
    })
    return Promise.all(tokensToDelete)
  }