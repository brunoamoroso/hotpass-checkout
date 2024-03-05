import express from "express";
import path from "path";
import checkoutRoutes from "./routes/checkoutRoutes.mjs";
import exphbs from "express-handlebars";
import session from "express-session";
import {default as connectMongoSessions} from 'connect-mongodb-session';

//get dirname
const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

const app = express();
const hbs = exphbs.create({
  partialsDir: path.join(__dirname, 'views/partials'),
})

app.engine("handlebars", hbs.engine);
app.set("view engine", "handlebars");


//update views directory
app.set("views", path.join(__dirname, "views"));

//set static directory
app.use(express.static(path.join(__dirname, "public")));

app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use(express.json());

app.use(cors({
  origin: "https://hotsense-payment.vercel.app/",
  credentials: true
}))

const MongoDBStore = connectMongoSessions(session);

const store = new MongoDBStore({
  uri: process.env.MONGODB_URI + "checkoutSessionsDB",
  collection: "express-sessions"
});

store.on('error', (err) => {
  console.log(err);
})

app.use(session({
  secret: "hotsense_secret",
  resave: false,
  saveUninitialized: false,
  store: store,
  cookie: {
    path: "/",
    domain: "https://hotsense-payment.vercel.app/",
    secure: true,
    maxAge: 360000,
    httpOnly: true,
    sameSite: 'lax',
  }
}));

//Routes
app.use("/checkout", checkoutRoutes);

app.use(function (req, res){
  res.status(404);
  res.render('404', {layout: false});
});

app.listen(3000, () => {
  console.log("Server running on 3000");
});
