const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
require("dotenv").config();
const serviceAccount = require("./smart-deal-firebase-adminsd.json");
const app = express();
const port = 3000;
app.use(cors());
app.use(express.json());
//model-db:ln8EZw3WjosINW9w

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// const uri = "mongodb://localhost:27017";
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@databasedesign.lirnheb.mongodb.net/?appName=databaseDesign`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyToken = async (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res.status(401).send({
      message: "Unauthorized access. Token not found!",
    });
  }

  const token = authorization.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);

    // Store user info in req.user
    req.user = decoded;

    // Upsert user info in MongoDB
    await usersCollection.updateOne(
      { uid: decoded.uid }, // match by Firebase UID
      {
        $set: {
          email: decoded.email,
          name: decoded.name || decoded.displayName || null,
          lastLogin: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true } // insert if not exists
    );

    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    res.status(401).send({
      message: "Unauthorized access. Invalid token.",
    });
  }
};

async function run() {
  try {
    await client.connect();
    db = client.db("event-db");
    usersCollection = db.collection("users");
    console.log("Connected to MongoDB!");

    app.post("/register", verifyToken, async (req, res) => {
      try {
        const userData = req.body; // { displayName, photoURL, email }

        // uid comes from verified Firebase token
        const uid = req.user.uid;

        // Save (or update) user info in MongoDB
        const result = await usersCollection.updateOne(
          { uid },
          {
            $set: {
              uid,
              email: req.user.email,
              name: userData.displayName,
              photoURL: userData.photoURL,
              createdAt: new Date(),
            },
          },
          { upsert: true }
        );

        res.status(200).send({
          success: true,
          message: "User registered and saved to MongoDB",
          result,
        });
      } catch (error) {
        console.error("Error saving user:", error);
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running fine!");
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
