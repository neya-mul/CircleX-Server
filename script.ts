import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import express, { Request, Response } from "express";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
const app = express();

const port = Number(process.env.PORT) || 5000;



app.use(cors())
app.use(express.json())


app.get("/", (req: Request, res: Response) => {
    res.send("server is running");
});

const client = new MongoClient(process.env.MONGO_URI as string, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
async function run() {


    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

        const db = client.db('CircleX');
        const postCollection = db.collection('all-posts')




        app.get('/all-posts', async (req: Request, res: Response) => {
            const result = await postCollection.find().toArray()
            res.json(result)
        })

    app.get('/all-posts/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        
        // ফিক্সড: সরাসরি id ভেরিয়েবলটি পাস করতে হবে
        const result = await postCollection.findOne({ _id: new ObjectId(id as string) });
        
        if (!result) {
            return res.status(404).json({ message: "Post not found" });
        }
        
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: "Invalid ObjectId format" });
    }
});












        app.listen(port, () => {
            console.log(`Example app listening on port ${port}`);
        });


    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);







