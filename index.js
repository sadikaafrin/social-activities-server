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
    eventCollection = db.collection("events");
    joinCollection = db.collection("join_event");
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

    // get all event
    app.get("/upcoming-events", async (req, res) => {
      const result = await eventCollection.find().toArray();
      res.send(result);
    });

    // single upcoming events
    app.get("/upcoming-events-details/:id", async (req, res) => {
      const { id } = req.params;
      const objectId = new ObjectId(id);

      const result = await eventCollection.findOne({ _id: objectId });

      res.send({
        success: true,
        result,
      });
    });

    // add event
    app.post("/events", verifyToken, async (req, res) => {
      const data = req.body;
      // console.log(data)
      const result = await eventCollection.insertOne(data);
      res.send({
        success: true,
        result,
      });
    });

    // update my crated event
    app.put("/events/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const data = req.body;
        const objectId = new ObjectId(id);
        const filter = { _id: objectId };
        const update = {
          $set: data,
        };

        const result = await eventCollection.updateOne(filter, update);

        if (result.matchedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Event not found",
          });
        }

        // Get the updated event to return
        const updatedEvent = await eventCollection.findOne({ _id: objectId });

        res.send({
          success: true,
          result,
          data: updatedEvent,
        });
      } catch (error) {
        console.error("Error updating event:", error);
        res.status(500).send({
          success: false,
          message: "Internal server error",
        });
      }
    });
    //     app.put("/events/:id", verifyToken, async (req, res) => {
    //   const { id } = req.params;
    //   const data = req.body;
    //   const objectId = new ObjectId(id);
    //   const filter = { _id: objectId };
    //   const update = {
    //     $set: data,
    //   };

    //   const result = await eventCollection.updateOne(filter, update);

    //   res.send({
    //     success: true,
    //     result,
    //   });
    // });

    // delete event
    app.delete("/events/:id", async (req, res) => {
      const { id } = req.params;
      //    const objectId = new ObjectId(id)
      // const filter = {_id: objectId}
      const result = await eventCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.send({
        success: true,
        result,
      });
    });

    // my created event
    app.get("/my-created-events", verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.created_by = email;
      }
      const cursor = eventCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/join-event/:id", async (req, res) => {
      try {
        const eventId = req.params.id;
        const { joined_by } = req.body;
        const alreadyJoined = await joinCollection.findOne({
          event_id: eventId,
          joined_by: joined_by,
        });

        if (alreadyJoined) {
          return res
            .status(400)
            .send({ message: "User already joined this event" });
        }

        // Otherwise insert the join
        const result = await joinCollection.insertOne({
          ...req.body,
          event_id: eventId,
        });

        // (Optional) increment join count on main event
        await eventCollection.updateOne(
          { _id: new ObjectId(eventId) },
          { $inc: { join: 1 } }
        );

        res.send({ success: true, message: "Successfully joined event" });
      } catch (error) {
        console.error("Error joining event:", error);
        res.status(500).send({ message: "Failed to join event" });
      }
    });

    // app.get("/events-join", async (req, res) => {
    //   const email = req.query.email;
    //   const query = {};
    //   if (email) {
    //     query.created_by = email;
    //   }
    //   const cursor = eventCollection.find(query);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });
    // check join event by user email
    app.get("/check-joined", async (req, res) => {
      const { eventId, email } = req.query;
      const joined = await joinCollection.findOne({
        joined_by: email,
        event_id: eventId,
      });
      res.send({ joined: !!joined });
    });

    // join event
    app.post("/join-event/:id", async (req, res) => {
      const data = req.body;
      const id = req.params.id;
      //downloads collection...
      const result = await joinCollection.insertOne(data);

      //downloads counted
      const filter = { _id: new ObjectId(id) };
      const update = {
        $inc: {
          join: 1,
        },
      };
      const joinCounted = await eventCollection.updateOne(filter, update);
      res.send({ result, joinCounted });
    });

    // my join event
    const { ObjectId } = require("mongodb");
    app.get("/my-join-event", async (req, res) => {
      const email = req.query.email;

      const result = await joinCollection
        .aggregate([
          { $match: { joined_by: email } },
          {
            $lookup: {
              from: "events",
              let: { eventId: { $toObjectId: "$event_id" } },
              pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$eventId"] } } }],
              as: "eventInfo",
            },
          },
          { $unwind: "$eventInfo" },
          {
            $project: {
              name: "$eventInfo.name",
              event_date: "$eventInfo.event_date",
              location: "$eventInfo.location",
              created_by: "$eventInfo.created_by",
              description: "$eventInfo.description",
              thumbnail: "$eventInfo.thumbnail",
              joined_by: 1,
            },
          },
        ])
        .toArray();

      res.send(result);
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
