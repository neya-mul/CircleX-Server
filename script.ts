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



        // ১. আপনার আগের রাউট (সব পোস্ট দেখার জন্য)
       app.get('/all-posts', async (req: Request, res: Response) => {
    try {
        const {
            search = '',
            category = 'all',
            page = '1',
            limit = '8'
        } = req.query as { search?: string; category?: string; page?: string; limit?: string };

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 8);

        // 🔍 ডাইনামিক কোয়েরি তৈরি করা
        const query: any = {};

        if (category && category !== 'all') {
            query.category = category;
        }

        if (search && search.trim() !== '') {
            // content, authorName, বা tag — যেকোনো একটাতে ম্যাচ করলেই রেজাল্টে আসবে
            query.$or = [
                { content: { $regex: search, $options: 'i' } },
                { authorName: { $regex: search, $options: 'i' } },
                { tag: { $regex: search, $options: 'i' } },
            ];
        }

        // মোট কতগুলো পোস্ট এই ফিল্টারে ম্যাচ করে (পেজিনেশনের জন্য দরকার)
        const totalCount = await postCollection.countDocuments(query);

        const posts = await postCollection
            .find(query)
            .sort({ _id: -1 }) // নতুন পোস্ট আগে দেখানোর জন্য
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .toArray();

        res.json({
            posts,
            totalCount,
            totalPages: Math.ceil(totalCount / limitNum) || 1,
            currentPage: pageNum,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error while fetching posts" });
    }
})
        // ২. আপনার আগের রাউট (সিঙ্গেল পোস্ট দেখার জন্য)
        app.get('/all-posts/:id', async (req: Request, res: Response) => {
            try {
                const { id } = req.params;
                const result = await postCollection.findOne({ _id: new ObjectId(id as string) });
                if (!result) return res.status(404).json({ message: "Post not found" });
                res.json(result);
            } catch (error) {
                res.status(400).json({ error: "Invalid ObjectId format" });
            }
        });
        app.patch('/all-posts/:id', async (req: Request, res: Response) => {
            try {
                const { id } = req.params;
                const { userId } = req.body; // ফ্রন্টএন্ড থেকে user.id আসছে

                if (!userId) {
                    return res.status(400).json({ message: "User ID is required" });
                }

                // ১. ডাটাবেজ থেকে কারেন্ট পোস্টটি খুঁজে বের করুন
                const post = await postCollection.findOne({ _id: new ObjectId(id as string) });

                if (!post) {
                    return res.status(404).json({ message: "Post not found" });
                }

                // ২. যদি ডাটাবেজে আগে থেকে likedBy অ্যারে না থাকে, তবে একটি খালি অ্যারে তৈরি করুন
                const likedBy = post.likedBy || [];

                // চেক করুন এই ইউজার অলরেডি লাইক দিয়েছে কি না
                const hasLiked = likedBy.includes(userId);

                let updateQuery = {};

                if (hasLiked) {
                    // ইউজার অলরেডি লাইক দিয়ে থাকলে -> অ্যারে থেকে আইডি সরান এবং likes ১ কমান
                    updateQuery = {
                        $pull: { likedBy: userId },
                        $inc: { likes: -1 }
                    };
                } else {
                    // ইউজার প্রথমবার লাইক দিলে -> অ্যারেতে আইডি যোগ করুন এবং likes ১ বাড়ান
                    updateQuery = {
                        $addToSet: { likedBy: userId }, // $addToSet দিলে কোনোভাবেই ডুপ্লিকেট আইডি ঢুকবে না
                        $inc: { likes: 1 }
                    };
                }

                // ৩. ডাটাবেজে ডাটা আপডেট এবং সেভ করা (CRITICAL STEP)
                await postCollection.updateOne(
                    { _id: new ObjectId(id as string) },
                    updateQuery
                );

                // ৪. আপডেট হওয়ার পর ডাটাবেজ থেকে লেটেস্ট ডাটাটি আবার রিড করুন ফ্রন্টএন্ডে পাঠানোর জন্য
                const updatedPost = await postCollection.findOne({ _id: new ObjectId(id as string) });

                // ফ্রন্টএন্ডে রেসপন্স পাঠানো
                res.json({
                    message: hasLiked ? "Unliked" : "Liked",
                    isLikedNow: !hasLiked,
                    currentLikes: updatedPost?.likes || 0,
                    likedByArray: updatedPost?.likedBy || []
                });

            } catch (error) {
                console.error(error);
                res.status(500).json({ error: "Server error while updating like" });
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







