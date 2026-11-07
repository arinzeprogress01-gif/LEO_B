
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import Guest from "../../models/Guest.js";

const TOKEN_ISSUER = "leo-api";
const TOKEN_AUDIENCE = "leo-client";
const TOKEN_EXPIRY = "365d";

const createGuestIdentity = async () => {
    const secret = process.env.LEO_GUEST_TOKEN_SECRET;

    if (!secret) {
        throw new Error("LEO_GUEST_TOKEN_SECRET is not configured");
    }

    // Generate a unique identity for this guest.
    const guestId = randomUUID();

    // Create the guest record in the shared LEO_DATA collection.
    const guest = await Guest.create({
        guestId,
        ownerId: guestId,
        status: "active",
        lastActiveAt: new Date()
    });

    // Issue a signed token. The guest ID is the token subject.
    const token = jwt.sign(
        { type: "guest" },
        secret,
        {
            subject: guestId,
            issuer: TOKEN_ISSUER,
            audience: TOKEN_AUDIENCE,
            expiresIn: TOKEN_EXPIRY
        }
    );

    return {
        guestId: guest.guestId,
        token,
        tokenType: "Bearer",
        expiresIn: TOKEN_EXPIRY
    };
};

export default createGuestIdentity;
