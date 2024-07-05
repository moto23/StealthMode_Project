const express = require('express');
const connectDB = require('./config/db');
const cors = require('cors');
const path = require('path');
const authRouter = require('./routes/auth');
const coursesRouter = require('./routes/courses');
require('dotenv').config();

// Initialize Express
const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // Middleware to parse JSON data


app.use(cors(

  {
  
  origin: ["https://sleath-frontend.vercel.app"], 
  methods: ["POST", "GET"],
  credentials:true
  
  }
  ));


// Connect to MongoDB
connectDB();
app.get("/", (req, res) => { 
   res.json("Hello");

})

app.use('/api/auth', authRouter);
app.use('/api/courses', coursesRouter);



// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../frontend/build')));

// Catch-all route to serve the index.html file for any route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
});

app.get('/api/enrolled', (req, res) => {
  const { userId } = req.query;

  Enrolled.find({ userId })
    .then(courses => res.json(courses))
    .catch(error => res.status(500).json({ error: 'Error fetching enrolled courses' }));
});


// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
