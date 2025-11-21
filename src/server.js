import cors from "cors";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
//import { date } from "drizzle-orm/mysql-core";
import multer from "multer";
dotenv.config();

const app = express();
const PORT = process.env.VITE_API_PORT || 3000;
//const multer = require("multer");
app.use(
  cors({
    origin: "http://localhost:5173",
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
    sameSite: "lax",
  });
  res.cookie("my-refresh-token", authData.session.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
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
    sameSite: "lax",
  });
  res.cookie("my-refresh-token", data.session.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
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
        sameSite: "lax",
      });
      res.cookie("my-refresh-token", refreshData.session.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
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

  const {
    first_name,
    last_name,
    email,
    major,
    img_url,
    bio,
    grad_year,
    date_of_birth,
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
});
app.post(
  "/users/:id/uploadavatar",
  upload.single("image"),
  async (req, res) => {
    const userId = req.params.id;
    console.log("req.file:", req.file);
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.file;
    const buffer = req.file.buffer;
    const mimetype = req.file.mimetype;

    const filePath = `avatars/${userId}-${Date.now()}.png`;

    latestImageBuffer = buffer;
    latestImageType = mimetype;
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("useravatars")
      .upload(filePath, buffer, {
        contentType: mimetype,
        upsert: true,
      });

    if (uploadError) {
      console.error("Supabase upload error:", uploadError);
      return res.status(500).json({ error: uploadError.message });
    }
    const { data: signedData } = supabaseAdmin.storage
      .from("useravatars")
      .createSignedUrl(filePath, 60 * 60); // 1 hour expiry
    if (signedError) {
      console.error("Signed URL error:", signedError);
      return res.status(500).json({ error: signedError.message });
    }

    const signedUrl = signedData.signedUrl;

    const { error: dbError } = await supabaseAdmin
      .from("users")
      .update({ img_url: signedUrl })
      .eq("user_id", userId);
    if (dbError) {
      console.error("Database update error:", dbError);
      return res.status(500).json({ error: dbError.message });
    }
    res
      .status(200)
      .json({ message: "File uploaded successfully", url: signedUrl });
  }
);
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
