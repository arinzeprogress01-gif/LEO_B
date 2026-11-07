
import mongoose from "mongoose";

const leoDataSchema = new mongoose.Schema(
    {
        recordType: {
            type: String,
            required: true,
            enum: [
                "guest",
                "user",
                "conversation",
                "message",
                "saved_phrase",
                "learning_progress",
                "preference"
            ]
        },

        ownerId: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true,
        collection: "LEO_DATA",
        discriminatorKey: "recordType"
    }
);

// Helps retrieve records by type and owner.
leoDataSchema.index({
    recordType: 1,
    ownerId: 1,
    createdAt: -1
});

const LeoData =
    mongoose.models.LeoData ||
    mongoose.model("LeoData", leoDataSchema);

export default LeoData;
