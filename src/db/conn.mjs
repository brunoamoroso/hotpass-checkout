import mongoose from "mongoose";
import { configDotenv } from "dotenv";
configDotenv();

const connect = () => mongoose.createConnection(process.env.MONGODB_URI);

const connectionFactory = () => {
  const db = connect(process.env.MONGODB_URI);
  db.on("open", () => {
    console.log("Mongoose connection open on local!");
  });
  db.on("error", (err) => {
    throw new Error(err);
  });

  return db;
};

const conn = connectionFactory();

export default conn;