import { initializeApp } from "firebase-admin";
import { applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";



const adminSdk = initializeApp({
    credential: applicationDefault(),
    projectId: "learnez-gdgochack"
})
/**
 * 
 * @param {import("socket.io").Socket} socket 
 * @param {(err?: import("socket.io").ExtendedError) => void} next 
 */
export async function firebaseAuthMiddleware(socket, next) {
    const idToken = socket.handshake.auth.idToken;
    if (!idToken) { next(new Error("Invalid authentication.")); return; }
    const user = (await getAuth(adminSdk).verifyIdToken(idToken));
    if (user && user.email_verified) {
        socket.handshake.auth.user = user;
        
        next(); return;
    }
    next(new Error("Invalid authentication."));
}