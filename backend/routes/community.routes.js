const express = require("express");

const router = express.Router();

const {
  getAllPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  toggleLike,
  addComment,
  deleteComment,
} = require("../controllers/community.controller");

const { protect } = require("../middleware/auth");
const upload = require("../middleware/upload");

// Get all posts
router.get("/", getAllPosts);

// Get single post
router.get("/:id", getPostById);

// Create post (supports image upload via multipart/form-data)
router.post("/", protect, upload.single("image"), createPost);

// Update post
router.put("/:id", protect, upload.single("image"), updatePost);

// Delete post
router.delete("/:id", protect, deletePost);

// Like / Unlike
router.post("/:id/like", protect, toggleLike);

// Add comment
router.post("/:id/comments", protect, addComment);

// Delete comment
router.delete(
  "/:id/comments/:commentId",
  protect,
  deleteComment
);

module.exports = router;