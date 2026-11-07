
import mongoose from "mongoose";

const connectDatabase = async () => {
    try {
        const connection = await mongoose.connect(
            process.env.MONGODB_URI,
            {
                dbName: "LEO_BASE",
                serverSelectionTimeoutMS: 10000,
            }
        );

        console.log(
            `MongoDB connected: ${connection.connection.host}`
        );

        console.log(
            `Database: ${connection.connection.name}`
        );

    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        process.exit(1);
    }
};

export default connectDatabase;
