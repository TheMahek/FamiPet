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

// Get all posts
router.get("/", getAllPosts);

// Get single post
router.get("/:id", getPostById);

// Create post
router.post("/", protect, createPost);

// Update post
router.put("/:id", protect, updatePost);

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