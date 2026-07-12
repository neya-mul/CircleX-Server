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
        // await client.connect();
        // // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");

        const db = client.db('CircleX');
        const postCollection = db.collection('all-posts')
        const userCollection = db.collection('user')



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




        app.post('/add-post', async (req: Request, res: Response) => {
            try {
                // 🆕 title ফিল্ডটি এখানে ডিস্ট্রাকচার করা হয়েছে
                const { title, authorName, authorEmail, avatar, category, content, contentImage, tag } = req.body;

                if (!title || !authorName || !content) {
                    return res.status(400).json({ message: "Title, Author name and Content are required" });
                }

                const newPost = {
                    title, // 👈 ডাটাবেজে টাইটেল সেভ হবে
                    authorName,
                    authorEmail,
                    avatar,
                    category,
                    content,
                    contentImage,
                    tag,
                    likes: 0,
                    likedBy: [],
                    createdAt: new Date()
                };

                const result = await postCollection.insertOne(newPost);
                res.status(201).json({ message: "Post created successfully", insertedId: result.insertedId });
            } catch (error) {
                res.status(500).json({ error: "Server error while adding post" });
            }
        });


        app.get('/my-posts', async (req: Request, res: Response) => {
            try {
                const email = req.query.email as string;

                if (!email) {
                    return res.status(400).json({ message: "Email query parameter is required" });
                }

                // ডাটাবেজ থেকে ইউজারের ইমেইল অনুযায়ী ফিল্টার করা
                const query = { authorEmail: email };
                const posts = await postCollection.find(query).sort({ createdAt: -1 }).toArray();

                return res.status(200).json(posts);
            } catch (error) {
                console.error("Error fetching posts:", error);
                return res.status(500).json({ error: "Server error while fetching user posts" });
            }
        });

        // 🗑️ ২. নির্দিষ্ট পোস্ট ডিলিট করার রাউট (Type-Safe)
        app.delete('/delete-post/:id', async (req: Request, res: Response) => {
            try {
                const { id } = req.params;

                // 🆕 টাইপ গার্ড চেক: নিশ্চিত হওয়া যে id কোনো অ্যারে (string[]) নয়, বরং শুধুই একটি string
                if (!id || Array.isArray(id)) {
                    return res.status(400).json({ message: "Invalid or multiple Post IDs provided" });
                }

                // এখন TypeScript কনফার্ম যে `id` একটি পিওর string, তাই isValid-এ এরর দেবে না
                if (!ObjectId.isValid(id)) {
                    return res.status(400).json({ message: "Invalid Post ID format" });
                }

                const query = { _id: new ObjectId(id) };
                const result = await postCollection.deleteOne(query);

                if (result.deletedCount === 1) {
                    return res.status(200).json({ message: "Post deleted successfully", success: true });
                } else {
                    return res.status(404).json({ message: "Post not found", success: false });
                }
            } catch (error) {
                console.error("Error deleting post:", error);
                return res.status(500).json({ error: "Server error while deleting post" });
            }
        });


        // 🔄 ৩. পোস্ট আপডেট করার রাউট (Type-Safe)
        app.put('/update-post/:id', async (req: Request, res: Response) => {
            try {
                const { id } = req.params;
                const { title, content, category, tag, contentImage } = req.body;

                if (!id || Array.isArray(id)) {
                    return res.status(400).json({ message: "Invalid or multiple Post IDs provided" });
                }

                if (!ObjectId.isValid(id)) {
                    return res.status(400).json({ message: "Invalid Post ID format" });
                }

                if (!title || !content) {
                    return res.status(400).json({ message: "Title and Content are required fields" });
                }

                const filter = { _id: new ObjectId(id) };
                const updatedDoc = {
                    $set: {
                        title,
                        content,
                        category,
                        tag: tag.startsWith('#') ? tag : tag ? `#${tag}` : '',
                        contentImage,
                        updatedAt: new Date() // এডিট করার সময় ট্র্যাক রাখার জন্য
                    }
                };

                const result = await postCollection.updateOne(filter, updatedDoc);

                if (result.matchedCount === 1) {
                    return res.status(200).json({ message: "Post updated successfully", success: true });
                } else {
                    return res.status(404).json({ message: "Post not found", success: false });
                }
            } catch (error) {
                console.error("Error updating post:", error);
                return res.status(500).json({ error: "Server error while updating post" });
            }
        });


        // 📊 ৪. ইউজারের অ্যানালিটিক্স ডাটা গেট করার রাউট
        app.get('/user-analytics', async (req: Request, res: Response) => {
            try {
                const email = req.query.email as string;
                if (!email) {
                    return res.status(400).json({ message: "Email is required" });
                }

                // ১. বেসিক কাউন্টস
                const posts = await postCollection.find({ authorEmail: email }).toArray();
                const totalPosts = posts.length;
                const totalLikes = posts.reduce((sum, post) => sum + (post.likes || 0), 0);

                // ২. চার্টের জন্য ক্যাটাগরি বন্টন (Aggregation)
                const categoryData = await postCollection.aggregate([
                    { $match: { authorEmail: email } },
                    { $group: { _id: "$category", value: { $sum: 1 } } },
                    { $project: { name: "$_id", value: 1, _id: 0 } }
                ]).toArray();

                // ৩. টপ ৩ পারফর্মিং পোস্ট
                const topPosts = await postCollection.find({ authorEmail: email })
                    .sort({ likes: -1 })
                    .limit(3)
                    .toArray();

                return res.status(200).json({ totalPosts, totalLikes, categoryData, topPosts });
            } catch (error) {
                return res.status(500).json({ error: "Analytics failed to load" });
            }
        });



        // 👤 ৫. ইউজারের প্রোফাইল আপডেট করার রাউট
        app.put('/update-profile', async (req: Request, res: Response) => {
            try {
                const { email, name } = req.body;

                if (!email) {
                    return res.status(400).json({ message: "User email is required" });
                }
                if (!name || !name.trim()) {
                    return res.status(400).json({ message: "Name cannot be empty" });
                }

                // আপনার ইউজার কালেকশনের নাম অনুযায়ী এটি পরিবর্তন করুন (ধরে নিচ্ছি userCollection)
                const filter = { email: email };
                const updatedDoc = {
                    $set: { name: name.trim() }
                };

                const result = await userCollection.updateOne(filter, updatedDoc);

                // প্রোফাইল এডিট করার পর ওই ইউজারের তৈরি করা আগের পোস্টগুলোর authorName-ও আপডেট করতে চাইলে:
                await postCollection.updateMany({ authorEmail: email }, { $set: { authorName: name.trim() } });

                return res.status(200).json({ message: "Profile updated successfully", success: true });
            } catch (error) {
                console.error("Error updating profile:", error);
                return res.status(500).json({ error: "Server error while updating profile" });
            }
        });





    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


        app.listen(port, () => {
            console.log(`Example app listening on port ${port}`);
        });






