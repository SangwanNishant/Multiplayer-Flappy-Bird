require("dotenv").config()
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express()
const PORT = process.env.PORT || 3000; 


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
})

const User = mongoose.model("User", userSchema)

// Root route
// Serve the main menu (index.html) when the root route is accessed
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/main-menu.html");
});

app.get('/game', (req, res) => {
    try {
        // Serve the index.html but append the query parameter
        res.sendFile(path.join(__dirname, 'public', 'game.html'));
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
app.post("/signup", async (req,res) => {
    const { username, password} = req.body
    
    try {
        // check if user exists
        const existingUser  = await User.findOne({username})
        if(existingUser){
            return res.status(400).json({message: "Username already exists"})
        }

        // hash password
        const hashedPassword = await bcrypt.hash(password, 10)

        // save user
        const newUser =  new User({username, password: hashedPassword})
        await newUser.save()

        res.status(201).json({message: "User created successfully"})

    } catch (error) {
        res.status(500).json({message:"Error creating user" , error:error.message})
    }

})

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

        res.status(200).json({message:"Login Successful", token: "token"})

    } catch (error) {
        res.status(500).json({message: "Error logging in user",error: error.message})
    }
})

// starting server
app.listen(PORT ,()=>{
    console.log(`Server running on http://localhost:${PORT}`)
})