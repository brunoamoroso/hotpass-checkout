import { Client } from "@pagarme/pagarme-nodejs-sdk";
import { configDotenv } from "dotenv";
configDotenv();

console.log(process.env.PGMSK);
const client = new Client({
  basicAuthUserName: process.env.PGMSK,
  basicAuthPassword: "",
});

export default client;
