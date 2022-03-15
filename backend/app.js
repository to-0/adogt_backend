const express = require('express')
const cors = require('cors')
require('dotenv').config()
// na generovanie tokenov, po prihlaseni sa vygeneruje token ten bude mat ulozeny
const { v4: uuidv4 } = require('uuid');

const app = express()
app.use(cors())
const port = 8000

//ulozene tokeny podla ID pouzivatela
var tokens = {}

// aby som videl co mi psoiela user v request body
app.use(express.json()) // for parsing application/json
app.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencode
// na citanie form-data
const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));

//database
const pgp = require('pg-promise')(/* options */)
const db = pgp(`postgres://${process.env["DB_USER"]}:${process.env["DB_PASS"]}@localhost:5432/mtaa_zadanie2`)

function test(){
    db.one('INSERT INTO users(name,email,password) VALUES($1, $2, $3) RETURNING id', ['test','email@email.email','heslo'])
    .then((data)=>{
        console.log("Success");
    })
    .catch((error)=>{
        console.log("NEMA NIC");
        console.log(error);
    })
}

// vrati false ak pouzivatel neexistuje
function check_user(username,email){
    db.one('SELECT * FROM users WHERE users.username = $1 or users.email = $2',[username,email])
    .then((data)=>{
        console.log("user found");
        console.log(data);
        return true;
    })
    .catch((error)=>{
        console.log('User not found');
        return false;
    })
    return false;
}



app.get('/', (req, res) => {
  res.send('Test');
})

//test databazy
app.get('/api/dbtest', (req, res) => {
  db.many('SELECT * FROM users')
  .then((data) => {
    res.send(JSON.stringify(data));
  })
  .catch((error) => {
    console.log('error', error);
  })
})
// prihlasenie pouzivatela
app.get('/users/signUser', (req,res)=>{
    username = req.body.username
    password = req.body.password
    db.one('SELECT * FROM users WHERE users.name = $1 and users.password = $2',[username,password])
    .then((data)=>{
        t = uuidv4();
        tokens[t] = {"id":data.id,"shelter":data.shelter}
        console.log(data)
        console.log(tokens)
        res.json({'message':'OK','token':t});
    })
    .catch((error)=>{
        res.status(400).json({'message':'Invalid username or password'})
    })

})
// registracia pouzivatela
app.post('/users/register',(req,res)=>{
    username = req.body.username;
    email = req.body.email;
    password = req.body.password;
    shelter = req.body.shelter;
    console.log(username,password,email);
    // ak pouzivatel neexistuje
    if (check_user(username,email) == false){
        db.one('INSERT INTO users(name,email,password,shelter) VALUES($1, $2, $3,$4) RETURNING id,shelter', [username, email, password,shelter])
        .then((data)=>{
            t = uuidv4();
            console.log(data.id)
            //k tokenom mam idcka a rolu ci je utulok alebo nie
            tokens[t] = {"id":data.id,"shelter":data.shelter}
            console.log(tokens)
            res.json({'message':'OK','token':t});
        })
        .catch((error)=>{
            res.status(400).json({'message':'Fail'});
        })
    }
    else{
        res.status(400).send({'message':'User already exists'});
    }
})


app.get('/users/:userID/', (req, res)=>{
  id = req.params["userID"];
  db.one("SELECT * FROM users WHERE users.id = $1",id).then((data)=>{
    res.json(data);
  })
  .catch((error)=>{
    console.log(error);
  })
})
app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
})