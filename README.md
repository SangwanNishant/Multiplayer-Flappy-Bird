# Multiplayer Flappy Bird
 

Multiplayer Flappy Bird is a web-based game inspired by the classic Flappy Bird. This version allows users to compete with friends and features user authentication, leaderboards, and a guest mode for quick access. Future updates will include a "Friends" feature for enhanced social interactions.

## Features

### Core Gameplay
- Classic Flappy Bird mechanics.
- Dynamic obstacles (pipes) and scoring system.

### Multiplayer Features
1. **Guest Mode**:
   - Play without signing up or logging in.
   - Scores are temporarily displayed on the leaderboard but not stored permanently.

2. **User Authentication**:
   - Secure user signup and login.
   - Authorization ensures users remain logged in during gameplay sessions.

3. **Leaderboard**:
   - Displays the top scores for all players.
   - Logged-in users' scores are compared with their highest scores and updated if exceeded.
   - Guest players' scores are temporarily displayed for competition.

4. **Game Modes**:
   - Separate routes for guest players (`/game/guest`) and logged-in users (`/game/user`).
   - Both routes currently share similar content but cater to different player types.

### Upcoming Features
- **Friends Feature**:
   - Add and manage friends within the platform.
   - Compete with friends for high scores and achievements.

## Technologies Used
- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express.js
- **Database**: MongoDB (MongoDB Atlas for cloud storage)
- **Hosting**: Render.com

