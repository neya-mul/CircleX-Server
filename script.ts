import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose-cjs";

const app = express();
const port = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json());

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

const JWKS = createRemoteJWKSet(
    new URL(`${process.env.FRONTEND_URL}/api/auth/jwks`)
);

export const verifyToken = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader?.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }

        const token = authHeader.split(" ")[1];

        const { payload } = await jwtVerify(token, JWKS);
        console.log(payload)

        req.user = payload;

        next();
    } catch (err) {
        console.error(err);
        return res.status(401).json({
            message: "Invalid Token",
        });
    }
};





// Connect once, log success/failure, but don't block route registration
client.connect()
    .then(() => console.log("Mongo connected"))
    .catch((err) => console.error("Mongo connection error:", err));

const db = client.db('CircleX');
const postCollection = db.collection('all-posts');
const userCollection = db.collection('user');

// ১. আপনার আগের রাউট (সব পোস্ট দেখার জন্য)
app.get('/all-posts', async (req: Request, res: Response) => {
    try {
        const {
            search = '',
            category = 'all',
            page = '1',
            limit = '8',
            sortBy = 'newest'
        } = req.query as { search?: string; category?: string; page?: string; limit?: string; sortBy?: string };

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 8);

        const query: any = {};

        // Case-insensitive regex tracking to prevent capitalization string match failures
        if (category && category !== 'all') {
            query.category = { $regex: `^${category}$`, $options: 'i' };
        }

        if (search && search.trim() !== '') {
            query.$or = [
                { content: { $regex: search, $options: 'i' } },
                { authorName: { $regex: search, $options: 'i' } },
                { tag: { $regex: search, $options: 'i' } },
            ];
        }

        let sortQuery: any = { _id: -1 }; 
        if (sortBy === 'mostLiked') {
            sortQuery = { likes: -1, _id: -1 }; 
        } else if (sortBy === 'leastLiked') {
            sortQuery = { likes: 1, _id: -1 };
        }

        const totalCount = await postCollection.countDocuments(query);

        const posts = await postCollection
            .find(query)
            .sort(sortQuery)
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
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Server error while fetching posts" });
    }
});

// ২. আপনার আগের রাউট (সিঙ্গেল পোস্ট দেখার জন্য)
app.get('/all-posts/:id', verifyToken, async (req: Request, res: Response) => {

    try {
        const { id } = req.params;
        console.log(id)
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
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }

        const post = await postCollection.findOne({ _id: new ObjectId(id as string) });

        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        const likedBy = post.likedBy || [];
        const hasLiked = likedBy.includes(userId);

        let updateQuery = {};

        if (hasLiked) {
            updateQuery = {
                $pull: { likedBy: userId },
                $inc: { likes: -1 }
            };
        } else {
            updateQuery = {
                $addToSet: { likedBy: userId },
                $inc: { likes: 1 }
            };
        }

        await postCollection.updateOne(
            { _id: new ObjectId(id as string) },
            updateQuery
        );

        const updatedPost = await postCollection.findOne({ _id: new ObjectId(id as string) });

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

app.post('/add-post', verifyToken, async (req: Request, res: Response) => {
    try {
        const { title, authorName, authorEmail, avatar, category, content, contentImage, tag } = req.body;

        if (!title || !authorName || !content) {
            return res.status(400).json({ message: "Title, Author name and Content are required" });
        }

        const newPost = {
            title,
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

app.get('/my-posts',verifyToken, async (req: Request, res: Response) => {
    try {
        const email = req.query.email as string;

        if (!email) {
            return res.status(400).json({ message: "Email query parameter is required" });
        }

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

        if (!id || Array.isArray(id)) {
            return res.status(400).json({ message: "Invalid or multiple Post IDs provided" });
        }

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
                tag: tag ? (tag.startsWith('#') ? tag : `#${tag}`) : '',
                contentImage,
                updatedAt: new Date()
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

        const posts = await postCollection.find({ authorEmail: email }).toArray();
        const totalPosts = posts.length;
        const totalLikes = posts.reduce((sum, post) => sum + (post.likes || 0), 0);

        const categoryData = await postCollection.aggregate([
            { $match: { authorEmail: email } },
            { $group: { _id: "$category", value: { $sum: 1 } } },
            { $project: { name: "$_id", value: 1, _id: 0 } }
        ]).toArray();

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
// 👤 ৫. ইউজারের প্রোফাইল আপডেট করার রাউট
app.put('/update-profile', async (req: Request, res: Response) => {
    try {
        const { email, name } = req.body;

        if (!email) {
            return res.status(400).json({ message: "User email is required", success: false });
        }
        if (!name || !name.trim()) {
            return res.status(400).json({ message: "Name cannot be empty", success: false });
        }

        const filter = { email: email };
        const updatedDoc = {
            $set: { name: name.trim() }
        };

        // 🔄 ইউজার কালেকশন আপডেট করা এবং ফলাফল চেক করা
        const result = await userCollection.updateOne(filter, updatedDoc);

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "User not found", success: false });
        }

        // 📝 পোস্ট কালেকশনেও authorName সিঙ্ক করা
        await postCollection.updateMany(
            { authorEmail: email },
            { $set: { authorName: name.trim() } }
        );

        return res.status(200).json({ message: "Profile updated successfully", success: true });
    } catch (error) {
        console.error("Error updating profile:", error);
        return res.status(500).json({ error: "Server error while updating profile", success: false });
    }
});

// Only run a real listening server locally — Vercel handles this itself
if (process.env.NODE_ENV !== "production") {
    app.listen(port, () => {
        console.log(`Example app listening on port ${port}`);
    });
}

export default app;