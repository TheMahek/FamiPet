const CommunityPost = require("../models/CommunityPost");
const {
  isValidObjectId,
  escapeRegExp,
  stringOrUndefined,
  MAX_SEARCH_LENGTH,
  COMMUNITY_CATEGORIES,
} = require("../utils/validation");
const {
  storeImageFile,
  deleteStoredImage,
  isSafeImageValue,
} = require("../utils/imageUpload");

// ==========================
// Get All Community Posts
// ==========================
exports.getAllPosts = async (req, res) => {
  try {
    const { category, search } = req.query;

    const query = {
      isActive: true,
    };

    if (category !== undefined) {
      const c = stringOrUndefined(category);
      if (c === undefined || !COMMUNITY_CATEGORIES.includes(c.toLowerCase())) {
        return res.status(400).json({ success: false, message: "Invalid category." });
      }
      query.category = c.toLowerCase();
    }

    if (search !== undefined) {
      const s = stringOrUndefined(search);
      if (s === undefined) {
        return res.status(400).json({ success: false, message: "Invalid search." });
      }
      const term = s.trim().slice(0, MAX_SEARCH_LENGTH);
      if (term) {
        const rx = new RegExp(escapeRegExp(term), "i");
        query.$or = [
          { title: rx },
          { content: rx },
        ];
      }
    }

    const posts = await CommunityPost.find(query)
      .populate("user", "name email avatar")
      .populate("likes", "name")
      .populate("comments.user", "name avatar")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: posts.length,
      posts,
    });
  } catch (error) {
    console.error("Get Community Posts Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ==========================
// Get Single Post
// ==========================
exports.getPostById = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid post ID." });
    }

    const post = await CommunityPost.findById(req.params.id)
      .populate("user", "name email avatar")
      .populate("likes", "name")
      .populate("comments.user", "name avatar");

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
      });
    }

    res.status(200).json({
      success: true,
      post,
    });
  } catch (error) {
    console.error("Get Community Post Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ==========================
// Create Post
// ==========================
exports.createPost = async (req, res) => {
  try {
    const { title, content, category, image } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: "Title and content are required.",
      });
    }

    if (typeof title !== "string" || title.trim().length > 200) {
      return res.status(400).json({ success: false, message: "Invalid title." });
    }

    if (typeof content !== "string" || content.trim().length > 5000) {
      return res.status(400).json({ success: false, message: "Invalid content." });
    }

    if (category !== undefined && category !== null && category !== "") {
      if (typeof category !== "string" || !COMMUNITY_CATEGORIES.includes(String(category).toLowerCase())) {
        return res.status(400).json({ success: false, message: "Invalid category." });
      }
    }

    let imageUrl = image;

    if (req.file) {
      // Multipart image upload: validate content, store server-side.
      const stored = await storeImageFile(req.file.buffer, "animal-planet/community");
      if (stored.invalid) {
        return res.status(400).json({ success: false, message: "File is not a valid image." });
      }
      imageUrl = stored.url
        ? stored.url
        : `${req.protocol}://${req.get("host")}/uploads/${stored.filename}`;
    } else if (image !== undefined && image !== null && image !== "") {
      // Body-supplied image value: only application-generated image URLs /
      // base64 image dataURLs are accepted (no arbitrary external payloads).
      if (!isSafeImageValue(image)) {
        return res.status(400).json({ success: false, message: "Invalid image." });
      }
    }

    const post = await CommunityPost.create({
      user: req.user.id,
      title: title.trim(),
      content: content.trim(),
      category: category ? String(category).toLowerCase() : "general",
      image: imageUrl,
    });

    const populatedPost = await CommunityPost.findById(post._id)
      .populate("user", "name email avatar");

    res.status(201).json({
      success: true,
      message: "Post created successfully.",
      post: populatedPost,
    });
  } catch (error) {
    console.error("Create Community Post Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ==========================
// Update Post
// ==========================
exports.updatePost = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid post ID." });
    }

    const post = await CommunityPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
      });
    }

    // Only post owner can update
    if (post.user.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own post.",
      });
    }

    const { title, content, category, image } = req.body;

    if (title !== undefined) {
      if (typeof title !== "string" || title.trim().length > 200) {
        return res.status(400).json({ success: false, message: "Invalid title." });
      }
      post.title = title.trim();
    }

    if (content !== undefined) {
      if (typeof content !== "string" || content.trim().length > 5000) {
        return res.status(400).json({ success: false, message: "Invalid content." });
      }
      post.content = content.trim();
    }

    if (category !== undefined) {
      if (typeof category !== "string" || !COMMUNITY_CATEGORIES.includes(String(category).toLowerCase())) {
        return res.status(400).json({ success: false, message: "Invalid category." });
      }
      post.category = String(category).toLowerCase();
    }

    const previousImage = post.image;

    if (req.file) {
      const stored = await storeImageFile(req.file.buffer, "animal-planet/community");
      if (stored.invalid) {
        return res.status(400).json({ success: false, message: "File is not a valid image." });
      }
      post.image = stored.url
        ? stored.url
        : `${req.protocol}://${req.get("host")}/uploads/${stored.filename}`;
    } else if (image !== undefined && image !== null && image !== "") {
      if (!isSafeImageValue(image)) {
        return res.status(400).json({ success: false, message: "Invalid image." });
      }
      post.image = image;
    }

    await post.save();

    // When replacing an image, remove the previous stored asset (best effort).
    if (previousImage && previousImage !== post.image) {
      deleteStoredImage(previousImage);
    }

    res.status(200).json({
      success: true,
      message: "Post updated successfully.",
      post,
    });
  } catch (error) {
    console.error("Update Community Post Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ==========================
// Delete Post
// ==========================
exports.deletePost = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid post ID." });
    }

    const post = await CommunityPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
      });
    }

    // Owner or admin can delete
    if (
      post.user.toString() !== req.user.id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to delete this post.",
      });
    }

    await CommunityPost.findByIdAndDelete(req.params.id);

    // Remove the post image after a successful delete (best effort).
    if (post.image) {
      deleteStoredImage(post.image);
    }

    res.status(200).json({
      success: true,
      message: "Post deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Community Post Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ==========================
// Like / Unlike Post
// ==========================
exports.toggleLike = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid post ID." });
    }

    const post = await CommunityPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
      });
    }

    const userId = req.user.id;

    const alreadyLiked = post.likes.some(
      (id) => id.toString() === userId.toString()
    );

    if (alreadyLiked) {
      post.likes = post.likes.filter(
        (id) => id.toString() !== userId.toString()
      );
    } else {
      post.likes.push(userId);
    }

    await post.save();

    res.status(200).json({
      success: true,
      message: alreadyLiked ? "Post unliked." : "Post liked.",
      likesCount: post.likes.length,
      liked: !alreadyLiked,
    });
  } catch (error) {
    console.error("Toggle Like Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ==========================
// Add Comment
// ==========================
exports.addComment = async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: "Comment text is required.",
      });
    }

    if (typeof text !== "string" || text.trim().length > 1000) {
      return res.status(400).json({ success: false, message: "Invalid comment text." });
    }

    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid post ID." });
    }

    const post = await CommunityPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
      });
    }

    post.comments.push({
      user: req.user.id,
      text: text.trim(),
    });

    await post.save();

    const updatedPost = await CommunityPost.findById(post._id)
      .populate("user", "name email avatar")
      .populate("comments.user", "name avatar");

    res.status(200).json({
      success: true,
      message: "Comment added successfully.",
      post: updatedPost,
    });
  } catch (error) {
    console.error("Add Comment Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ==========================
// Delete Comment
// ==========================
exports.deleteComment = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id) || !isValidObjectId(req.params.commentId)) {
      return res.status(400).json({ success: false, message: "Invalid ID." });
    }

    const post = await CommunityPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
      });
    }

    const comment = post.comments.id(req.params.commentId);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found.",
      });
    }

    if (
      comment.user.toString() !== req.user.id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to delete this comment.",
      });
    }

    comment.deleteOne();

    await post.save();

    res.status(200).json({
      success: true,
      message: "Comment deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Comment Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};