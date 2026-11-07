
import jwt from "jsonwebtoken";
import Guest from "../models/Guest.js";

const guestAuth = async (req, res, next) => {
    try {
        const secret = process.env.LEO_GUEST_TOKEN_SECRET;

        if (!secret) {
            return res.status(500).json({
                success: false,
                message: "Guest authentication is not configured."
            });
        }

        const authorization = req.headers.authorization;

        if (!authorization || !authorization.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Guest authentication token is required."
            });
        }

        const token = authorization.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Invalid authorization header."
            });
        }

        const decoded = jwt.verify(token, secret, {
            issuer: "leo-api",
            audience: "leo-client"
        });

        if (decoded.type !== "guest" || !decoded.sub) {
            return res.status(401).json({
                success: false,
                message: "Invalid guest token."
            });
        }

        const guest = await Guest.findOne({
            guestId: decoded.sub,
            status: "active"
        });

        if (!guest) {
            return res.status(401).json({
                success: false,
                message: "Guest identity is invalid or inactive."
            });
        }

        req.guest = guest;
        req.guestId = guest.guestId;

        next();
    } catch (error) {
        if (
            error.name === "TokenExpiredError" ||
            error.name === "JsonWebTokenError"
        ) {
            return res.status(401).json({
                success: false,
                message: "Guest token is invalid or expired."
            });
        }

        console.error("Guest authentication error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Guest authentication failed."
        });
    }
};

export default guestAuth;
