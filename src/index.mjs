import express from "express";
import path from "path";
import checkoutRoutes from "./routes/checkoutRoutes.mjs";
import exphbs from "express-handlebars";
import session from "express-session";
import os from 'os';
import FileStoreFactory from "session-file-store";

const FileStore = FileStoreFactory(session);

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

app.use(session({
  name: "session",
  secret: "hotsense_secret",
  resave: false,
  saveUninitialized: false,
  store: new FileStore({
    logFn: function(){},
    path: path.join(os.tmpdir(), "sessions"),
  }),
  cookie: {
    secure: false,
    maxAge: 360000,
    httpOnly: true,
  }
}));

//Routes
app.use(function (req, res){
  res.status(404);
  res.render('404', {layout: false});
});
app.use("/checkout", checkoutRoutes);

app.listen(3000, () => {
  console.log("Server running on 3000");
});
