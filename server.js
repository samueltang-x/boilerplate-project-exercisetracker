const express = require('express')
const app = express()
const bodyParser = require('body-parser')

const cors = require('cors')

const mongoose = require('mongoose')
mongoose.connect(process.env.MONGO_URI)
//mongoose.createConnection(process.env.MONGO_URI, {useMongoClient: true})

// create mongoose schema and model for user accounts
var ExerciseTrackerUserSchema = new mongoose.Schema({
  username: {type: String, required: true, unique: true},
  password: {type: String, required: true}
});

var ExerciseTrackerUserModel = mongoose.model('exerciseTrackerUser', ExerciseTrackerUserSchema);

// create mongoose schema and model for exercises.
var ExercisesSchema = mongoose.Schema({
  username: {type: String, required: true},
  date: {type: Date, required: true},
  duration: {type: Number, required: true},
  description: String
});

var ExerciseModel = mongoose.model('exercises', ExercisesSchema);

app.use(cors())

app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())



app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});


// generate random password
var generatePassword = function(len) {
  return Math.random().toString(36).slice(-len);
};

// insertUserDocIntoDB
var insertUserDocIntoDB = function(req, res, next) {
  var status = 200;
  var body = {};
  
  var username = req.username;
  var password = req.password;
  
  var userDoc = new ExerciseTrackerUserModel( {username: username.toLowerCase(), password: password} );
  userDoc.save((err, doc) => {
    if (err) {
      console.log("Failed to save doc into exerciseTrackerUser, error: ", err);
      status = 500;
      body = {status: 'failed', message: 'Internal Server Error'};
    } else {
      console.log("Save doc into exerciseTrackerUser succeeded.");
      status = 200;
      body = {status: 'succeeded', username: username, password: password};
    }
    
    res.statusCode = status;
    res.body = body;
    
    next(req, res);
  });  // End of save method call.
};

// find user in Mongo DB
var findUser = function(req, res, next, nextOnFailure) {
  
  var status = 200;
  var body = {};
  
  var username = req.username;
  
  var lowerCaseName = username.toLowerCase();
  ExerciseTrackerUserModel.find( {username: lowerCaseName}, (err, doc) => {
    if (err) {
      console.log('Error, failed to query DB, error message: ', err);
      status = 500;
      body = {status: 'failed', message: 'Internal Server Error'};
    } else {
      
      console.log('docs found: ', doc);
      
      if ( doc.length >= 1 ) {
        console.log('Failed to create user, username already exists.');
        status = 200;
        body = {status: 'failed', message: 'Username already exists.'};
      } else {
        console.log('Be goint to insert doc for user: ', username);
        var password = generatePassword(8);
        console.log('User: ' + username + ', Password: ' + password);
        req.password = password;
        return next(req, res, respondUser);
      }        
    }
    res.statusCode = status;
    res.body = body;
    
    nextOnFailure(req, res);
    //res.status(status).type('application/json').send(body);
  });  // End of find method call.
};


// Add exercise Function
var addExercise = (req, res, next) => {
  var status = 200;
  var body = {};
  
  var exercise = req.exercise;
  
  console.log('Be going to save to db for exercise: ', exercise);
  var ecDoc = new ExerciseModel( exercise );
  ecDoc.save((err, doc) => {
    if (err) {
      console('Error: failed to save doc into DB, error message: ', err);
      return res.status(500).type('application/json')
        .send({status: 'failed', message: 'Internal Server Error'});
    }
  
    console.log('Succeeded to save: ', doc);
    status = 200;
    body = exercise;
    body.username = req.username;

    res.statusCode = status;
    res.body = body;
    
    next(req, res);
  });
}

var findExercise = (req, res, next) => {
  
  var status = 200;
  var body = {};
  
  var username = req.body.userId.toLowerCase();
  var date = new Date(req.body.date);
  var duration = req.body.duration;
  var description = req.body.description;
  var exercise = {username: username, date: date, duration: duration, description: description};
  
  ExerciseModel.find( exercise, (err, ec) => {
    if (err) {
      console.log('Error: query DB failed, error msg: ', err);
      return res.status(500).type('application/json')
        .send({status: 'failed', message: 'Internal Server Error'});
    }
    
    if ( ec.length >=1 ) {
      console.log('Error, exercise already exsits.');
      status = 409;
      body = {status: 'failed', message: 'Exercise already exists'};
      return res.status(status).type('application/json')
        .send(body);
    } else {
      
      req.exercise = exercise;
      next(req, res, respondUser);
    }
  } );
}


// Query DB for exercises
var queryExercises = (req, res, next) => {
  
  var status = 200;
  var body = {};
  
  var username = req.query.userId.toLowerCase();
  var from = req.query.from;
  var to = req.query.to;
  var limit = parseInt(req.query.limit);
  
  var exercisesQuery = {username: username, date: {}};
  if ( from ) { exercisesQuery.date['$gte'] = new Date(from); }
  if ( to ) { exercisesQuery.date['$lte'] = new Date(to); }
  
  var sortOptions = {date: 'desc'};
    
  console.log('DEBUG - exercises query: ', exercisesQuery);
  console.log('DEBUG - sorting options: ', sortOptions);
  
  var query = ExerciseModel.find(exercisesQuery).sort(sortOptions);
  
  if ( limit >= 1 ) { query.limit(limit); }
  
  query.select('-_id -__v').exec((err, exercises) => {
    if (err) {
      console.log('Error, query exercises from DB failed, error message: ', err);
      status = 500;
      body = {status: 'failed', message: 'Internal Server Error'};
    } else {
      status = 200;
      body = {status: 'succeeded', exercises: exercises};
    }   
    
    res.statusCode = status;
    res.body = body;
    
    next(req, res);
  });
};


// Validate User
var validateUser = (req, res, next, nextOnFailure, afterNext) => {
  
  var status = 200;
  var body = {};
  
  var username = (req.username ? req.username : req.query.userId).toLowerCase();
  //var from = req.query.from;
  //var to = req.query.to;
  //var limit = req.query.limit;
  
  var userQuery = {username: username};
  
  ExerciseTrackerUserModel.find(userQuery, (err, users) => {
    if (err) {
      console.log('Error, query user info from DB failed, error message: ', err);
      status = 500;
      body = {status: 'failed', message: 'Internal Server Error'};
      
      res.statusCode = status;
      res.body = body;
      return nextOnFailure(req, res);
    }
    
    if ( users.length === 0 ) {
      console.log('Error, user does not exist: ', username);
      status = 403;
      body = {
        status: 'failed',
        message: 'invalid user', 
        ref: {
          name: 'create user', 
          path: '/api/exercise/new-user', 
          method: 'POST',
          example: 'POST /api/exercise/new-user'
        }};
      res.statusCode = status;
      res.body = body;
      return nextOnFailure(req, res);
    }
    
    if ( users.length >= 1 ) {
      console.log('User validation succeeded.');
      return next(req, res, afterNext, respondUser);
    }
  });
};


// Respond User
var respondUser = function (req, res) {
  
  var status = res.statusCode;
  var body = res.body;
  
  console.log('Response status code: ', status);
  console.log('Response body: ', body);
  res.status(status).type('application/json').send(body);
};


// Create User API
app.post('/api/exercise/new-user', function(req, res) {
  
  console.log('Request body: ', req.body);
  var username = req.body.username;
  
  if ( username === undefined || username === '' ) {
    console.log('Invalid username.');
    res.status(400).type('text').end('Bad Request');
  } else {
    req.username = username;
    findUser(req, res, insertUserDocIntoDB, respondUser);
  }
})


// Add excercises API
app.post('/api/exercise/add', (req, res) => {
  console.log('Request Body: ', req.body);
  
  if ( req.body.userId === undefined || req.body.userId === '' || 
       req.body.date === undefined || req.body.date === '' || 
       req.body.duration === undefined || req.body.duration === '') {
    return res.status(400).type('application/json')
      .send({status: 'failed', message: 'Invalid request parameters'});
  }
  
  req.username = req.body.userId;
  
  console.log('Validating user...: ', req.body.userId);
  validateUser(req, res, findExercise, respondUser, addExercise);
  
  //console.log('Exercise to be added: ', req.body);
  //findExercise(req, res, addExercise);
})


// Get exercises API
app.get('/api/exercise/log', (req, res) => {
  console.log("Request body:", req.body);
  console.log('Request query: ', req.query);
  
  var username = req.query.userId;
  
  if ( username === undefined || username === '' ) {
    res.status(400).type('applicaion/json')
      .send({status: 'failed', message: 'Bad Request'});
  } else {
    validateUser(req, res, queryExercises, respondUser, respondUser);
  }
});


// Not found middleware
app.use((req, res, next) => {
  return next({status: 404, message: 'not found'})
})

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
})

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
