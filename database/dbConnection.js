import mongoose from "mongoose";


export const connection = () => {
  mongoose
    .connect(process.env.MONGO_URI, {
      dbName: "MERN_AUTHENTICATION",
    })
    .then(() => {
      console.log("✅ MongoDB Connected");
    })
    .catch((err) => {
      console.log(`❌ MongoDB Connection Failed: ${err}`);
    });
};