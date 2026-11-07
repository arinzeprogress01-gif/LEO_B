
import mongoose from "mongoose";
import LeoData from "./LeoData.js";

const guestSchema = new mongoose.Schema({
    guestId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    status: {
        type: String,
        enum: ["active", "merged", "disabled"],
        default: "active"
    },

    lastActiveAt: {
        type: Date,
        default: Date.now
    }
});

// Store guest records in the existing LEO_DATA collection.
const Guest =
    LeoData.discriminators?.Guest ||
    LeoData.discriminator("Guest", guestSchema, "guest");

export default Guest;
