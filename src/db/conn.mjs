import mongoose from "mongoose";
import { configDotenv } from "dotenv";
configDotenv();

const connect = () => mongoose.createConnection(process.env.MONGODB_URI);

const connectionFactory = () => {
  const db = connect(process.env.MONGODB_URI);
  db.on("open", () => {
    console.log("Mongoose connection open!");
  });
  db.on("error", (err) => {
    console.dir(err, {depth: null});
  });

  return db;
};

const conn = connectionFactory();

export default conn;