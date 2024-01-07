import { Client } from "@pagarme/pagarme-nodejs-sdk";
import { configDotenv } from "dotenv";
configDotenv();

const client = new Client({
  basicAuthUserName: process.env.PGMSK,
  basicAuthPassword: "",
});

export default client;
