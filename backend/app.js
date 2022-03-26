const express = require('express')
const multer  = require('multer')
var crypto = require('crypto'); 
const cors = require('cors')
require('dotenv').config()
// na generovanie tokenov, po prihlaseni sa vygeneruje token ten bude mat ulozeny
const { v4: uuidv4 } = require('uuid');

const app = express()
app.use(cors())
const port = 8000
const upload = multer()
const key = Buffer.from(crypto.randomBytes(32))
const iv = crypto.randomBytes(16)

//ulozene tokeny podla ID pouzivatela
var tokens = {"testToken":{id:2,shelter:true}}


// aby som videl co mi psoiela user v request body
app.use(express.json()) // for parsing application/json
app.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencode
// na citanie form-data
const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));

//database
const pgp = require('pg-promise')(/* options */)
const db = pgp(`postgres://${process.env["DB_USER"]}:${process.env["DB_PASS"]}@localhost:5432/mtaa_zadanie2`)

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

function check_token(token, res){
    if (tokens[token] == undefined) {
        res.status(400).send("Invalid token")
        return false
    }
    return true
}

function check_token_and_id(token, id, res) {
    if(tokens[token] == undefined || id == undefined){
        res.status(400).send("Invalid token or id");
        return false
    }
    return true
}

function test(){
    t = new Date()
    console.log(t)
    db.one("SELECT time from terms WHERE dog_id=$1 ORDER BY time DESC LIMIT 1",[1])
    .then((data) => {
        console.log("Dobry den")
        console.log(data)
        time = data.time;
        console.log(data.time)
        console.log(typeof time)
        today = new Date(data.time)
        console.log(today.getDate())
        t =JSON.stringify(time).substring(0,11)
        console.log(t, typeof t)
        console.log(JSON.stringify(time))
    })
    .catch((error)=>{
        console.log("Dobry vecer")
        time = undefined
    })
    
}
test()


// ----------------------------
//      SAMOTNE REQUESTY 
// ----------------------------
app.get('/', (req, res) => {
    console.log(req.params)
    console.log(req.query)
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

    encryption = crypto.createCipheriv('aes-256-cbc', key, iv);
    encryptedPassword = encryption.update(password)
    encryptedPassword += encryption.final('hex');

    db.one('SELECT * FROM users WHERE users.name = $1 and users.password = $2;' + 
           'UPDATE users SET password = $3 WHERE name = $1;',[username,password,encryptedPassword])
    .then((data)=>{
        t = uuidv4();
        tokens[t] = {"id":data.id,"shelter":data.shelter}
        console.log(data)
        console.log(tokens)
        res.json({'message':'OK','token':t});
    })
    .catch((error)=>{
        //res.status(400).json({'message':'Invalid username or password'})
        db.one('SELECT * FROM users WHERE users.name = $1 and users.password = $2;',[username,encryptedPassword])
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

})
// registracia pouzivatela
app.post('/users/register',(req,res)=>{
    username = req.body.username;
    email = req.body.email;
    password = req.body.password;
    shelter = req.body.shelter;

    encryption = crypto.createCipheriv('aes-256-cbc', key, iv);
    password = encryption.update(password)
    password += encryption.final('hex');

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
//nacitanie psov
app.get('/dogs/getAll', (req, res) => {
    token = req.query.token;
    if (!check_token(token, res))
        return
    
    userID = tokens[token]["id"]
    shelter = tokens[token]["shelter"];
    if (shelter == true) {  //pouzivatel je utulok
        db.many("SELECT * FROM dogs WHERE shelter_id = $1", userID)
        .then((data) => {
            dogs = []
            for (i = 0; i < data.length; i++) {
                dogs.push( {
                    "id": data[i].id,
                    "name": data[i].name,
                    "image_location": data[i].image_location
                });
            }
            console.log(dogs)
            res.json(dogs)
        })
        .catch((error) => {
            res.json(error)
            res.status(400).json({'message': 'Wrong request'})
        })
    }
    else { //pouzivatel je bezny
        db.many("SELECT * FROM dogs")
        .then((data) => {
            dogs = []
            for (i = 0; i < data.length; i++) {
                dogs.push( {
                    "id": data[i].id,
                    "name": data[i].name,
                    "image_location": data[i].image_location
                });
            }
            console.log(dogs)
            res.json(dogs)
        })
        .catch((error) => {
            res.json(error)
            res.status(400).json({'message': 'Wrong request'})
        })
    }
})

//nacitanie detailu psa
app.get('/dogs/getDog', (req, res) => {
    dog_id = req.query.dog_id;
    if (!check_token_and_id(req.query.token, dog_id, res))
        return

    db.one('SELECT * FROM dogs WHERE dogs.id = $1', [dog_id])
    .then((data) => {
        dog_detail = {
            "id": data.id,
            "name": data.name,
            "breed": data.breed,
            "age": data.age,
            "details": data.details,
            "image_location": data.image_location,
            "shelter_id": data.shelter_id,
            "health": data.health
        }
        console.log(dog_detail)
        res.json(dog_detail)
    })
    .catch((error)=>{
        console.log(error)
        res.status(400).json({'message':'Wrong request'})
    })
})

//nacitanie terminov psa
app.get('/terms', (req, res) => {
    dog_id = req.query.dog_id;
    if (!check_token_and_id(req.query.token, dog_id, res))
        return

    db.many('SELECT * FROM terms WHERE terms.dog_id = $1', [dog_id])
    .then((data) => {
        terms = []
        for (i = 0; i < data.length; i++) {
            terms.push( {
                "id": data[i].id,
                "date": data[i].time,
                "free": data[i].free
            });
            console.log(terms)
        }
        console.log(terms)
        res.json(terms)
    })
    .catch((error) => {
        console.log(error)
        res.status(400).json({'message':'Wrong request'})
    })
})

//pridanie psa
app.post('/dogs/addDog', (req, res) => {
    token = req.query.token;
    if (!check_token(token, res))
        return

    userID = tokens[token]["id"];
    shelter = tokens[token]["shelter"];
    dog_name = req.body.name;
    breed = req.body.breed;
    age = req.body.age;
    health = req.body.health;
    details = req.body.details;
    photo = req.body.photo;
    if (dog_name == undefined || breed == undefined || age == undefined || details == undefined || photo == undefined || health == undefined)
        res.status(400).send("Bad params");

    db.one("INSERT INTO dogs (name, breed, age, details, image_location, shelter_id, health) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ID", [dog_name, breed, age, details, photo, userID, health])
    .then((data) => res.status(200).send("OK"))
    .catch((error)=> res.status(400).send("Something went wrong"))
})

//uprava psa
app.put('/dogs/editDog', (req, res) => {
    if (!check_token(req.query.token, res))
        return

    dog_id = req.body.id;
    dog_name = req.body.name;
    breed = req.body.breed;
    age = req.body.age;
    health = req.body.health;
    details = req.body.details;
    photo = req.body.photo;
    if (dog_name == undefined || breed == undefined || age == undefined || details == undefined || photo == undefined || health == undefined || dog_id == undefined)
        res.status(400).send("Bad params");

    db.one("UPDATE dogs SET name = $1, breed = $2, age = $3, details = $4, image_location = $5, health = $6  WHERE id = $7 RETURNING id", 
        [dog_name, breed, age, details, photo, health, dog_id])
    .then((data) => res.send("OK"))
    .catch((error)=> res.status(400).send("Bad request"))
})

//vymazanie psa
app.delete('/dogs/deleteDog', (req, res) => {
    token = req.query.token;
    dog_id = req.query.dog_id;
    if (!check_token_and_id(token, dog_id, res))
        return

    userID = tokens[token]["id"];
    db.any("DELETE from dogs WHERE shelter_id = $1 AND id = $2", [userID, dog_id])
    .then((data) => res.send("OK"))
    .catch((error) => res.status(400).send("Bad request"))
})

// vytvorenie formulara
app.post('/forms/create', (req,res)=>{
    token = req.query.token;
    if (!check_token(token, res))
        return

    userID = tokens[token]["id"];
    shelter = tokens[token]["shelter"];
    dog_id = req.body.dog_id;
    type = req.body.type;
    details = req.body.details;
    if(details == undefined || dog_id == undefined || type==undefined){
        res.status(400).send("Bad params");
    }
    db.one("INSERT INTO forms(form_type,details,dog_id,user_id,created_at) VALUES ($1, $2, $3,$4, CURRENT_DATE) RETURNING ID", [type,details,dog_id,userID])
    .then((data)=>{
        //ak je to vencenie treba este sparovat termin s formularom
        if(type==2){
            term_id = req.body.term_id;
            if(term_id == undefined){
                db.any("DELETE FROM forms WHERE id=$1",[data.id])
                .then((data)=>{
                    res.status(400).send("Something went wrong");
                })
                .catch((error)=>{
                    res.status(400).send("Something went wrong");
                }) 
            }
            db.one("UPDATE terms SET form_id=$1 WHERE term_id=$2 RETURNING id",[data.id,term_id])
            .then((data)=>{
                res.send("OK")
            })
            .catch((error)=>{
                res.status(400).send("Something went wrong")
            })
        }
        res.status(200).send("OK")
    })
    .catch((error)=>{
        res.status(400).send("Something went wrong");
    })
})
//načítanie detailu formulára
app.get('/forms/detail',(req,res)=>{
    form_id = req.query.form_id;
    if (!check_token_and_id(req.query.token, form_id, res))
        return
    
    db.one("SELECT * FROM forms WHERE id=$1",[form_id])
    .then((data)=>{
        result = {
            "form_id": form_id,
            "dog_id": data.dog_id,
            "details": data.details,
            "type": data.form_type,
            "created_at": data.created_at
        }
        res.json(result)
    })
    .catch((error)=>{
        console.log(error)
        res.status(400).send("Wrong request")
    })
})
app.get('/forms/getAll',(req,res)=>{
    token = req.query.token;
    if (!check_token(token, res))
        return

    db.many("SELECT * FROM forms WHERE user_id=$1 ORDER BY id",[tokens[token]["id"]])
    .then((data)=>{
        forms = []
        for(var i=0; i<data.length;i++){
            forms.push( {
                "id": data[i].id,
                "dog_id": data[i].dog_id,
                "type": data[i].form_type,
                "created_at": data[i].created_at
            });
        }
        console.log(forms)
        res.json(forms)
    })
    .catch((error)=>{
        console.log(error)
        res.status(400).send("Wrong request")
    })
})
// editovanie formulara
app.put('/forms/edit',(req,res)=>{
    if (!check_token(req.query.token, res))
        return

    formId = req.body.id;
    details = req.body.details;
    finished = req.body.finished;
    db.one("UPDATE forms SET details = $1, finished = $2 WHERE id=$3 RETURNING id", [details,finished,formId])
    .then((data)=>{
        res.send("OK")
    })
    .catch((error)=>{
        res.status(400).send("Bad request")
    })
})
// vymazanie formulara
app.delete('/forms/delete',(req,res)=>{
    token = req.query.token;
    form_id = req.query.form_id;
    if (!check_token_and_id(token, form_id, res))
        return

    userID = tokens[token]["id"];
    db.any("DELETE from forms WHERE user_id=$1 AND id=$2",[userID,form_id])
    .then((data)=>{
        res.send("OK");
    })
    .catch((error)=>{
        res.status(400).send("Bad request");
    })
})
// vytvorenie terminov pre psa TODO DOROBIT
app.post('/terms/create',(req,res)=>{
    dog_id = req.query.dog_id;
    if (!check_token_and_id(req.query.token, dog_id, res))
        return
        
    start_date = req.body.start_date
    days = req.body.days
    //ziskam posledny formular pre psa
    var time = undefined
    db.one("SELECT time from terms WHERE dog_id=$1 ORDER BY time DESC LIMIT 1",[dog_id])
    .then((data) => {
        time = data.time
        insert_terms(dog_id,time)
    })
    .catch((error)=>{
        insert_terms(dog_id,new Date())
    })
    res.send("OK")
    

})
function insert_terms(dog_id, time){
    var today;
    today = new Date(time)
    var date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate();
    for(let i=1;i<=30;i++){
        next_date = new Date();
        next_date.setDate(today.getDate()+i)
        date = next_date.getFullYear()+'-'+(next_date.getMonth()+1)+'-'+next_date.getDate();
        db.none("INSERT INTO terms (free,dog_id,time) VALUES($1,$2,$3)", [true, dog_id, next_date])
        console.log("New date ")
        console.log(date)
    }
}

// uprava terminu
app.put('/terms/update',(req,res)=>{
    token = req.query.token;
    term_id = req.query.term_id;
    if (!check_token_and_id(token, term_id, res)) 
        return

    free = req.body.free
    user_id = tokens[token]["id"]
    db.one("UPDATE terms SET free=$1 and user_id=$2 WHERE id=$3 RETURNING id",[free,user_id,term_id])
    .then((data)=>{
        res.send("OK")
    })
    .catch((error)=>{
        res.status(400).send("Bad request")
    })
})

//nacitanie obrazku psa
app.get('/image', (req, res) => {
    dog_id = req.query.dog_id;
    if (!check_token_and_id(req.query.token, dog_id, res))
        return

    db.one('SELECT * FROM dogs WHERE dogs.id = $1', [dog_id])
    .then((data) => {
        image_info = {
            "type": data.image_type,
            "name": data.image_name,
            "data": data.image_data.toString('base64')
        }
        console.log(image_info)
        res.json(image_info)
    })
    .catch((error)=>{
        console.log(error)
        res.status(400).json({'message':'Wrong request'})
    })
})

//nahratie obrazku psa
app.put('/image/insert', upload.single('file'), (req, res) => {
    token = req.query.token;
    dog_id = req.query.dog_id;
    if (!check_token_and_id(token, dog_id, res))
        return

    type = req.file.mimetype;
    image_name = req.file.originalname;
    image_data = req.file.buffer;
    db.one("UPDATE dogs SET image_type = $1, image_name = $2, image_data = $3 WHERE id = $4 RETURNING id", [type, image_name, image_data, dog_id])
    .then((data) => {
        console.log(data)
        res.json(data)
    })
    .catch((error)=>{
        console.log(error)
        res.status(400).json({'message':'Wrong request'})
    })
})

// toto je tiez len taky test
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