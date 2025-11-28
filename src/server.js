import cors from "cors";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
//import { date } from "drizzle-orm/mysql-core";
import multer from "multer";
// install uuid
import { v4 as uuidv4 } from "uuid";
import path from "path";
dotenv.config();

const app = express();
const PORT = process.env.VITE_API_PORT || 3000;
//const multer = require("multer");
app.use(
  cors({
    origin: ["https://socialink-8842f.web.app"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
const storage = multer.memoryStorage();
const upload = multer({ storage });

let latestImageBuffer = null;
let latestImageType = null;

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ADMIN_KEY
);

app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

app.get("/users", async (req, res) => {
  const { data, error } = await supabase.from("users").select("*");
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.status(200).json(data);
});

app.get("/users/profiles", async (req, res) => {
  const accessToken = req.cookies["my-access-token"];
  if (!accessToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const { data, error } = await supabase.from("users").select(`
    *,
    user_profiles (
      user_id,
      date_of_birth,
      bio
    )
  `);
  if (error) {
    console.error("Query error:", error);
    return res.status(500).json({ error: error.message });
  }

  console.log("Data returned:", JSON.stringify(data, null, 2));
  res.status(200).json(data);
});

app.get("/test/user-profiles", async (req, res) => {
  const { data, error } = await supabase.from("user_profiles").select("*");
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.status(200).json({ count: data?.length || 0, data });
});

app.post("/users", async (req, res) => {
  const { email, first_name, last_name, major, bio, grad_year, date_of_birth } =
    req.body;

  const { data: user, error: userError } = await supabase
    .from("users")
    .insert([{ email, first_name, last_name, major, bio, grad_year }])
    .select("*")
    .single();

  if (userError) {
    return res.status(500).json({ error: userError.message });
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .insert([{ bio, date_of_birth }]);
  if (profileError) {
    return res.status(500).json({ error: profileError.message });
  }

  res.status(201).json({ user, profile });
  // alert("User created successfully");
});

app.post("/signup", async (req, res) => {
  const { email, password, first_name, last_name } = req.body;

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });
  if (authError) {
    return res.status(500).json({ error: authError.message });
  }
  const userId = authData.user.id;
  const { error: userError } = await supabase
    .from("users")
    .insert([{ user_id: userId, email, first_name, last_name }]);
  if (userError) {
    return res.status(500).json({ error: userError.message });
  }
  const { error: profileError } = await supabase.from("user_profiles").insert([
    {
      user_id: userId,
    },
  ]);
  if (profileError) {
    return res.status(500).json({ error: profileError.message });
  }

  // Set cookies BEFORE sending response
  res.cookie("my-access-token", authData.session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
  });
  res.cookie("my-refresh-token", authData.session.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
  });

  res.status(200).json(authData);
});
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Set cookies BEFORE sending response
  res.cookie("my-access-token", data.session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
  });
  res.cookie("my-refresh-token", data.session.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
  });

  // Send response only once with user data (not tokens)
  res.status(200).json({ user: data.user });
});
app.post("/logout", async (req, res) => {
  res.clearCookie("my-access-token");
  res.clearCookie("my-refresh-token");
  res.status(200).json({ message: "Logged out successfully" });
});

app.get("/users/me", async (req, res) => {
  const accessToken = req.cookies["my-access-token"];
  const refreshToken = req.cookies["my-refresh-token"];
  if (!accessToken || !refreshToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (!error) {
    return res.status(200).json(data.user);
  }

  if (error.message.includes("JWT") || error.message.includes("token")) {
    try {
      const { data: refreshData, error: refreshError } =
        await supabaseAdmin.auth.refreshSession({
          refresh_token: refreshToken,
        });
      if (refreshError) {
        console.error("Refresh error:", refreshError);
        return res
          .status(401)
          .json({ error: "Session expired. Please log in again." });
      }
      res.cookie("my-access-token", refreshData.session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "none",
      });
      res.cookie("my-refresh-token", refreshData.session.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "none",
      });
      return res.status(200).json(refreshData.user);
    } catch (e) {
      console.error("Unexpected error during token refresh:", e);
      return res
        .status(500)
        .json({ error: "Unexpected error. Please try again later." });
    }
  }
  console.error("Get user error:", error);
  return res.status(500).json({ error: "Unexpected server error:", error });

  // Only use 500 for unexpected system failures
  //console.error("Unexpected Server Error (500):", error);
});
app.get("/users/:id", async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from("users")
    .select(
      `*,
    user_profiles (*)`
    )
    .eq("user_id", id)
    .single();
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.status(200).json(data);
});
app.put("/users/:id", async (req, res) => {
  const { id } = req.params;

  let {
    first_name,
    last_name,
    email,
    major,
    img_url,
    bio,
    grad_year,
    date_of_birth,
    instagram,
    snapchat,
  } = req.body;
  console.log("Recieved body:", req.body);
  grad_year = grad_year ? parseInt(grad_year) : null;
  date_of_birth = date_of_birth || null;
  img_url = img_url || null;

  const { data: updatedUser, error: updatedError } = await supabase
    .from("users")
    .update({
      first_name,
      last_name,
      email,
      major,
      img_url,
      bio,
      grad_year,
      instagram,
      snapchat,
    })
    .eq("user_id", id)
    .select("*")
    .single();
  if (updatedError) {
    return res.status(500).json({ error: updatedError.message });
  }
  const { data: updatedProfile, error: profileError } = await supabase
    .from("user_profiles")
    .update({
      date_of_birth,
      bio,
    })
    .eq("user_id", id);
  if (profileError) {
    return res.status(500).json({ error: profileError.message });
  }

  const { data: fullUser, error: fetchError } = await supabase
    .from("users")
    .select(`*, user_profiles (*)`)
    .eq("user_id", id)
    .single();

  if (fetchError) throw fetchError;

  return res.status(200).json(fullUser);
});
/*
app.get("/users/:id/uploadavatar", (req, res) => {
  const { id } = req.params;
  const { data: user, error } = supabase
    .from("users")
    .select("img_url")
    .eq("user_id", id)
    .single();
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  if (!user || !user.img_url) {
    return res.status(404).json({ error: "No avatar found" });
  }
  return res.redirect(user.img_url);
});*/
app.post(
  "/users/:id/uploadavatar",
  upload.single("image"),
  async (req, res) => {
    const userId = req.params.id;
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.file;
    const buffer = req.file.buffer;
    const mimetype = req.file.mimetype;
    const ext = path.extname(file.originalname);
    const filePath = `${userId}/avatars/${uuidv4()}${ext}`;

    latestImageBuffer = buffer;
    latestImageType = mimetype;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("useravatars")
      .upload(filePath, buffer, {
        contentType: mimetype,
      });

    if (uploadError) {
      console.error("Supabase upload error:", uploadError);
      return res.status(500).json({ error: uploadError.message });
    }

    const { data: publicUrlData, error: publicUrlError } =
      await supabaseAdmin.storage.from("useravatars").getPublicUrl(filePath);

    if (publicUrlError) {
      console.error("Supabase public URL error:", publicUrlError);
      return res.status(500).json({ error: publicUrlError.message });
    }

    const img_url = publicUrlData.publicUrl;

    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update({ img_url })
      .eq("user_id", userId)
      .select("*")
      .single();

    if (updateError) {
      console.error("User update error:", updateError);
      return res.status(500).json({ error: updateError.message });
    }

    return res.status(200).json({
      message: "File uploaded successfully",
      data: uploadData,
      avatar_url: img_url,
    });
  }
);

app.get("/users/:id/avatar", async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabaseAdmin.storage
    .from("useravatars")
    .list(`${id}/avatars/`, {
      sortBy: {
        column: "created_at",
        order: "desc",
      },
    });
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.status(200).json(data);
});

app.get("/user/getotheruser/:id", async (req, res) => {
  const userId = req.params.id;
  const { data, error } = await supabase
    .from("users")
    .select(`*, user_profiles (*)`)
    .eq("user_id", userId)
    .single();
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.status(200).json(data);
});

app.post("/user/updatesavedposts/:id", async (req, res) => {
  const userId = req.params.id;
  const postId = req.body.postId;
  console.log("Post ID to add:", postId);
  const { data: savedPosts, error: savedPostsError } = await supabase
    .from("users")
    .select("saved_profiles")
    .eq("user_id", userId)
    .single();
  console.log("Saved posts:", savedPosts);
  if (savedPostsError) {
    return res.status(500).json({ error: savedPostsError.message });
  }
  const updatedPosts = [...(savedPosts.saved_profiles || []), postId];
  console.log("Updated posts:", updatedPosts);

  const { data: allUpdated, error: allUpdatedError } = await supabase
    .from("users")
    .update({ saved_profiles: updatedPosts })
    .eq("user_id", userId)
    .single();
  if (allUpdatedError) {
    return res.status(500).json({ error: allUpdatedError.message });
  }
  console.log("All updated user data:", allUpdated);
  res.status(200).json(allUpdated);
  /*const { data: allUpdated, error: allUpdatedError } = await supabase
    .from("users")
    .arrayAppend("saved_posts", [postId])
    .eq("user_id", userId)
    .single();
  if (allUpdatedError) {
    return res.status(500).json({ error: error.message });
  }
  res.status(200).json(allUpdated);*/
});
app.post("/user/removesavedposts/:id", async (req, res) => {
  const userId = req.params.id;
  const postId = req.body.postId;
  const { data: savedPosts, error: savedPostsError } = await supabase
    .from("users")
    .select("saved_profiles")
    .eq("user_id", userId)
    .single();
  if (savedPostsError) {
    return res.status(500).json({ error: savedPostsError.message });
  }

  const updatedPosts = (savedPosts.saved_profiles || []).filter(
    (id) => id !== postId
  );
  console.log("Updated posts after removal:", updatedPosts);

  const { data: allUpdated, error: allUpdatedError } = await supabase
    .from("users")
    .update({ saved_profiles: updatedPosts })
    .eq("user_id", userId)
    .single();
  if (allUpdatedError) {
    return res.status(500).json({ error: allUpdatedError.message });
  }
  res.status(200).json(allUpdated);
});

app.get("/user/savedprofiles/:id", async (req, res) => {
  const userId = req.params.id;
  const { data, error } = await supabase
    .from("users")
    .select("saved_profiles")
    .eq("user_id", userId)
    .single();
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  console.log("Saved posts data:", data);
  res.status(200).json(data);
});
app.post("/users/savedprofilespages", async (req, res) => {
  const postIds = req.body.postIds;
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .in("user_id", [...postIds]);
  console.log(postIds);
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.status(200).json(data);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
