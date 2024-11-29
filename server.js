require("dotenv").config()
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const validator = require('validator');



const app = express()
const PORT = 5000; 


// middleware
app.use(bodyParser.json());
app.use(cors());


  

app.use(express.static("public"));


// mongodb connection
mongoose.connect(process.env.MONGO_URI,{connectTimeoutMS: 30000,socketTimeoutMS: 30000})
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.error(err));

// user schema and model
const userSchema = new mongoose.Schema({
    username:{ type: String, required: true, unique: true },
    password: { type: String, required: true },
    // email: { type: String, required: true, unique: true },
    highestScore: { type: Number, default: 0 },
})



const User = mongoose.model("User", userSchema)

// leaderboard schema 
const leaderboardSchema = new mongoose.Schema({
    username:{ type: String, required: true, unique: true },
    score: {type: Number, required: true},
})
const Leaderboard =  mongoose.model('Leaderboard', leaderboardSchema);

// Root route
// Serve the main menu (index.html) when the root route is accessed
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/main-menu.html");
});

app.get('/guest', (req, res) => {
    try {
        // Serve the index.html but append the query parameter
        res.sendFile(path.join(__dirname, 'public', 'game-guest.html'));
    } catch (error) {
        console.error("Error serving /game route:", error);
        res.status(500).send("Internal Server Error");
    }
});


app.get('/user', (req, res) => {
    try {
        // Serve the index.html but append the query parameter
        res.sendFile(path.join(__dirname, 'public', 'user-menu.html'));
    } catch (error) {
        console.error("Error serving /game route:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.get('/user-game', (req, res) => {
    try {
        // Serve the index.html but append the query parameter
        res.sendFile(path.join(__dirname, 'public', 'user-game.html'));
    } catch (error) {
        console.error("Error serving /game route:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.get('/start', (req, res) => {
    try {
        // Serve the index.html but append the query parameter
        res.sendFile(path.join(__dirname, 'public', 'start.html'));
    } catch (error) {
        console.error("Error serving /game route:", error);
        res.status(500).send("Internal Server Error");
    }
});



// signup route
app.post('/signup', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
    }

    try {
        // Hash the password (if applicable)
        const hashedPassword = await bcrypt.hash(password, 10);

        // Save user to the database
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        console.log("User created:", newUser);

        // Send success response
        return res.status(201).json({ message: "User created successfully", username: `${username}` });
    } catch (error) {
        console.error("Error during signup:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});


// login route
app.post("/login", async (req, res) => {
    const { username, password } = req.body

    try {
        // check if user exists
        const user  = await User.findOne({username})

        if(!user){
            return res.status(404).json({ message: "User not found"})
        }

        // comparing passwords
        const isMatch = await bcrypt.compare(password,user.password)

        if(!isMatch){
            return res.status(401).json({message:"Invalid Credentials"})
        }

        // creating JWT 
        const token = jwt.sign({id: user._id, username: user.username}, process.env.JWT_SECRET, {
            expiresIn: "1h"
        })

        res.status(200).json({message:"Login Successful", token: `${token}`, username: `${username}`})

    } catch (error) {
        res.status(500).json({message: "Error logging in user",error: error.message})
    }
})

app.get('/leaderboard', async (req,res)=>{
    try{
        res.sendFile(path.join(__dirname, 'public', 'leaderboard.html'));
    }
        catch (error) {
            console.error("Error serving /leaederboard  route:", error);
            res.status(500).send("Internal Server Error");
        }
})
const crypto = require('crypto'); // For generating random strings
app.post('/submit-score', async (req, res) => {
    let { username, score } = req.body;

    try {
        console.log("Request received at /submit-score", req.body);

        // Handle guest users
        if (username === "GUEST") {
            
            username = `GUEST_${Math.random().toString(36).substring(2, 15)}`;
            console.log("Processing guest user score for username:", username);

            const leaderboard = await Leaderboard.find().sort({ score: -1 }).limit(10);
            if (leaderboard.length < 10 || score > leaderboard[leaderboard.length - 1].score) {
                console.log("Guest score qualifies for the leaderboard, adding...");
                await Leaderboard.create({ username, score });
            }

            const updatedLeaderboard = await Leaderboard.find().sort({ score: -1 }).limit(10);
            console.log("Updated leaderboard after guest addition:", updatedLeaderboard);
            return res.status(200).json({ leaderboard: updatedLeaderboard });
        }

        // Handle registered users
        console.log("Processing user score for username:", username);

        // Fetch the user from the database
        const user = await User.findOne({ username: req.body.username });
        if (!user) {
            console.log("User not found:", username);
            return res.status(404).json({ message: "User not found" });
        }

        score = Number(score);
        if (score > user.highestScore) {
            console.log(`Updating user's high score from ${user.highestScore} to ${score}`);
            user.highestScore = score;
            await user.save();
            console.log("User's high score successfully updated:", user.highestScore);
        } else {
            console.log(`User's current high score (${user.highestScore}) is higher than submitted score (${score})`);
        }

        // Check if the user's score exists in the leaderboard
        const existingEntry = await Leaderboard.findOne({ username });
        if (!existingEntry) {
            console.log("User not in leaderboard, adding...");
            await Leaderboard.create({ username, score: user.highestScore });
        } else if (user.highestScore > existingEntry.score) {
            console.log(`Updating user's leaderboard score from ${existingEntry.score} to ${user.highestScore}`);
            existingEntry.score = user.highestScore;
            await existingEntry.save();
        }

        // Fetch the updated leaderboard
        const updatedLeaderboard = await Leaderboard.find().sort({ score: -1 }).limit(10);
        console.log("Updated leaderboard after user update:", updatedLeaderboard);
        return res.status(200).json({ leaderboard: updatedLeaderboard });

    } catch (error) {
        console.error("Error in /submit-score:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});


















// Route to handle guest and user scores submission
// app.post('/leaderboard-submit', async (req, res) => {
//     const { username, score } = req.body;
//     let leaderboard = await Leaderboard.findOne();
  
//     if (!leaderboard) {
//       leaderboard = new Leaderboard({ scores: [] });
//       await leaderboard.save();
//     }
  
//     // Check if the username already exists in the leaderboard
//     const existingEntry = leaderboard.scores.find(entry => entry.username === username);
  
//     if (existingEntry) {
//       // If the player exists, update their score if the new score is higher
//       existingEntry.score = Math.max(existingEntry.score, score);
//     } else {
//       // If the player doesn't exist, add them to the leaderboard
//       leaderboard.scores.push({ username, score });
//     }
  
//     // Sort leaderboard by score and limit to top 10
//     leaderboard.scores = leaderboard.scores.sort((a, b) => b.score - a.score).slice(0, 10);
  
//     await leaderboard.save();
  
//     // Send back the updated leaderboard
//     res.json({ leaderboard: leaderboard.scores });
//   });
  

// starting server
app.listen(PORT ,()=>{
    console.log(`Server running on http://localhost:${PORT}`)
})