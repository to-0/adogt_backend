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

//ulozene tokeny podla ID pouzivatela
var tokens = {"testToken":{id:6,shelter:true}}


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
    console.log(username, email)
    db.any('SELECT * FROM users WHERE users.name = $1 or users.email = $2',[username,email])
    .then((data)=>{
        console.log("user found");
        console.log(data);
        return true;
    })
    .catch((error)=>{
        console.log(error);
        console.log('User not found');
        return false;
    })
}

function check_token(token, res){
    if (tokens[token] == undefined) {
        res.status(401).json({"message": "Unauthorized user or invalid token."});
        return false;
    }
    return true
}

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
    username = req.query.username
    password = req.query.password
    console.log(username, password)

    db.one('SELECT * FROM users WHERE users.name = $1 and users.password = $2;',[username,password])
    .then((data)=>{
        t = uuidv4();
        tokens[t] = {"id":data.id,"shelter":data.shelter}
        console.log(data)
        console.log(tokens)
        res.json({'message':'OK','token':t, 'shelter': data.shelter, 'email': data.email});
    })
    .catch((error)=>{
        res.status(404).json({'message':'Invalid username or password'});
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
    console.log(check_user(username, email))
    var exists = check_user(username, email);
    if (exists == false){
        if (username == undefined || email == undefined || password == undefined || shelter == undefined) {
            res.status(404).json({'message':'Not all attributes provided'});
            return;
        }
        
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
            console.log(error)
            res.status(404).json({'message':'Inserting data was not successful'});
        })
    }
    else{
        res.status(409).json({'message':'User already exists'});
    }
})
//nacitanie psov
app.get('/dogs/getAll', (req, res) => {
    token = req.query.token;
    if (!check_token(token, res))
        return
    
    userID = tokens[token]["id"]
    shelter = tokens[token]["shelter"];
    var raw_data = ''
    if (shelter == true) {  //pouzivatel je utulok
        db.many("SELECT * FROM dogs WHERE shelter_id = $1", userID)
        .then((data) => {
            dogs = []
            for (i = 0; i < data.length; i++) {
                raw_data = data[i].image_data;
                if (raw_data == null)
                    raw_data = ''
                dogs.push( {
                    "id": data[i].id,
                    "name": data[i].name,
                    "age": data[i].age,
                    "breed": data[i].breed,
                    "image_type": data[i].image_type,
                    //pridane po milestone 2
                    "data": raw_data.toString('base64')
                });
            }
            console.log(dogs)
            res.json(dogs)
            return
        })
        .catch((error) => {
            res.status(404).json({'message': 'No data found'})
            return
        })
    }
    else { //pouzivatel je bezny
        db.many("SELECT * FROM dogs")
        .then((data) => {
            dogs = []
            for (i = 0; i < data.length; i++) {
                raw_data = data[i].image_data;
                if (raw_data == null)
                    raw_data = ''
                dogs.push( {
                    "id": data[i].id,
                    "name": data[i].name,
                    "age": data[i].age,
                    "breed": data[i].breed,
                    "image_type": data[i].image_type,
                    "data": raw_data.toString('base64')
                });
            }
            console.log(dogs)
            res.json(dogs)
        })
        .catch((error) => {
            res.status(404).json({'message': 'No data found'})
        })
    }
})

//nacitanie detailu psa
app.get('/dogs/getDog', (req, res) => {
    token = req.query.token;
    dog_id = req.query.dog_id;
    if (!check_token(token, res))
        return;

    if (dog_id == undefined) {
        res.status(404).json({'message':'Not all attributes provided'});
        return;
    }

    if (isNaN(parseInt(dog_id))) {
        res.status(400).json({'message':'Not proper format of attributes.'});
        return;
    }

    userID = tokens[token]["id"];
    shelter = tokens[token]["shelter"];
    if (shelter == true) {
        db.one('SELECT * FROM dogs WHERE dogs.id = $1 AND dogs.shelter_id = $2', [dog_id, userID])
        .then((data) => {
            var raw_data = data.image_data
            if(raw_data == null){
                raw_data = ''
            }
            dog_detail = {
                "id": data.id,
                "name": data.name,
                "breed": data.breed,
                "age": data.age,
                "details": data.details,
                "shelter_id": data.shelter_id,
                "health": data.health,
                // pridane po milestone 2
                "data": raw_data.toString('base64')
            }
            console.log(dog_detail)
            res.json(dog_detail)
        })
        .catch((error)=>{
            console.log(error)
            res.status(404).json({'message':'No data found'})
        })
    }
    else {
        db.one('SELECT * FROM dogs WHERE dogs.id = $1', [dog_id])
        .then((data) => {
            var raw_data = data.image_data
            if(raw_data == null){
                raw_data = ''
            }
            dog_detail = {
                "id": data.id,
                "name": data.name,
                "breed": data.breed,
                "age": data.age,
                "details": data.details,
                "shelter_id": data.shelter_id,
                "health": data.health,
                // pridane po milestone 2
                "data": raw_data.toString('base64')
            }
            console.log(dog_detail)
            res.json(dog_detail)
        })
        .catch((error)=>{
            console.log(error)
            res.status(404).json({'message':'No data found'})
        })
    }
})

//nacitanie terminov psa
app.get('/terms', (req, res) => {
    token = req.query.token;
    dog_id = req.query.dog_id;
    if (!check_token(req.query.token, res))
        return;

    if (dog_id == undefined) {
        res.status(404).json({'message':'Not all attributes provided'});
        return;
    }
    if (isNaN(parseInt(dog_id))) {
        res.status(400).json({'message':'Not proper format of attributes.'});
        return;
    }
    
    userID = tokens[token]["id"];
    shelter = tokens[token]["shelter"];
    if (shelter == true) {
        db.many('SELECT * FROM terms WHERE terms.dog_id = $1 AND terms.dog_id IN (SELECT dogs.id FROM dogs WHERE shelter_id = $2)', [dog_id, userID])
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
            res.status(404).json({'message':'No data found'})
        })
    }
    else {
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
            res.status(404).json({'message':'No data found'})
        })
    }
})

//pridanie psa
app.post('/dogs/addDog', (req, res) => {
    token = req.query.token;
    if (!check_token(token, res))
        return;

    userID = tokens[token]["id"];
    shelter = tokens[token]["shelter"];
    dog_name = req.body.name;
    breed = req.body.breed;
    age = req.body.age;
    health = req.body.health;
    details = req.body.details;
    console.log(req.body);
    //photo = req.body.photo;
    if (dog_name == undefined || breed == undefined || age == undefined || details == undefined || health == undefined) {
        res.status(404).json({"message": "Not all attributes provided"});
        return;
    }

    if (shelter == false) {
        res.status(401).json({"message": "Signed user is not a shelter"});
        return;
    }

    if (isNaN(parseInt(age))) {
        res.status(400).json({'message':'Not proper format of attributes.'});
        return;
    }

    //db.one("INSERT INTO dogs (name, breed, age, details, image_location, shelter_id, health) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ID", [dog_name, breed, age, details, photo, userID, health])
    db.one("INSERT INTO dogs (name, breed, age, details, shelter_id, health) VALUES ($1, $2, $3, $4, $5, $6) RETURNING ID", [dog_name, breed, age, details, userID, health])
    .then((data) => res.status(200).json({"message":"OK", "id": data.id}))
    .catch((error)=> res.status(400).json({"message": "No data to be inserted"}))
})

//uprava psa
app.put('/dogs/editDog', (req, res) => {
    if (!check_token(req.query.token, res))
        return;

    token = req.query.token;
    dog_id = req.query.dog_id;
    dog_name = req.body.name;
    breed = req.body.breed;
    age = req.body.age;
    health = req.body.health;
    details = req.body.details;
    shelter = tokens[token]["shelter"];
    userID = tokens[token]["id"];
    if (dog_name == undefined || breed == undefined || age == undefined || details == undefined || health == undefined || dog_id == undefined) {
        res.status(404).json({"message": "Not all attributes provided"});
        return;
    }

    if (shelter == false) {
        res.status(401).json({"message": "Signed user is not a shelter"});
        return;
    }

    if (isNaN(parseInt(age))) {
        res.status(400).json({'message':'Not proper format of attributes.'});
        return;
    }

    db.one("UPDATE dogs SET name = $1, breed = $2, age = $3, details = $4, health = $5  WHERE id = $6 and shelter_id=$7 RETURNING id", 
        [dog_name, breed, age, details, health, dog_id,userID])
    .then((data) => res.status(200).json({"message": "OK"}))
    .catch((error)=> res.status(404).json({"message": "No data to be updated"}))
})

//vymazanie psa
app.delete('/dogs/deleteDog', (req, res) => {
    token = req.query.token;
    dog_id = req.query.dog_id;
    userID = tokens[token]["id"];
    shelter = tokens[token]["shelter"];
    if (!check_token(token, res))
        return;

    if (dog_id == undefined) {
        res.status(404).json({"message": "Not all attributes provided"});
        return;
    }

    if (shelter == false) {
        res.status(401).json({"message": "Signed user is not a shelter"});
        return;
    }

    if (isNaN(parseInt(dog_id))) {
        res.status(400).json({'message':'Not proper format of attributes.'});
        return;
    }

    db.any("DELETE FROM dogs WHERE dogs.shelter_id = $1 AND dogs.id = $2;", [userID, dog_id])
    .then((data) => {
        db.any("DELETE FROM terms WHERE terms.dog_id = $2; DELETE FROM forms WHERE forms.dog_id = $2", [userID, dog_id])
        .then((data) => res.status(200).json({"message": "OK"}))
    })
    .catch((error) => res.status(404).json({"message": "No data to be deleted"}))
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
    reason = req.body.reason;
    details = req.body.details;
    console.log("TYPE",type)
    if(details == undefined || dog_id == undefined || type==undefined){
        res.status(404).json({"message": "Not all attributes provided"});
        return;
    }

    if (reason == undefined){
        if (type == 1) {
            res.status(404).json({"message": "Not all attributes provided"});
            return;
        }
        if (type == 2)
            reason = null;
    }

    if (shelter == true) {
        res.status(401).json({"message": "Signed user is a shelter"});
        return;
    }

    if (isNaN(parseInt(dog_id)) || isNaN(parseInt(type))) {
        res.status(400).json({'message':'Not proper format of attributes.'});
        return;
    }

    db.one("INSERT INTO forms(form_type,reason,details,dog_id,user_id,created_at,finished) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, false) RETURNING ID", [type,reason,details,dog_id,userID])
    .then((data)=>{
        //ak je to vencenie treba este sparovat termin s formularom
        if(type==2){
            term_id = req.body.term_id;
            if(term_id == undefined || term_id == null){
                db.any("DELETE FROM forms WHERE id=$1",[data.id])
                .then((data)=>{
                    console.log("Idem posielat ze atributy nie su poskytnute")
                    res.status(400).json({"message": "Not all attributes provided"});
                    return; 
                })
                .catch((error)=>{
                    console.log("Idem posielat ze nieco sa pokazilo po tych atributoch")
                    res.status(404).json({"message": "No data to be deleted and not all attributes provided"});
                    return; 
                })
                
            }
            db.one("UPDATE terms SET form_id=$1, user_id=$2, free=false WHERE terms.id=$3 RETURNING id",[data.id,userID,term_id])
            .then((data)=>{
                res.status(200).json({"message":"OK"});
                return;
            })
            .catch((error)=>{
                res.status(404).json({"message": "No data to be updated"});
                return;
            })
        }
        else{
            res.status(200).json({"message": "OK"});
            return;
        }
    })
    .catch((error)=>{
        res.status(400).json({"message": "No data found"});
        return;
    })
})
//načítanie detailu formulára
app.get('/forms/detail',(req,res)=>{
    form_id = req.query.form_id;
    token = req.query.token;
    if (!check_token(token, res))
        return;

    if (form_id == undefined) {
        res.status(404).json({"message": "Not all attributes provided"});
        return;
    }

    if (isNaN(parseInt(form_id))) {
        res.status(400).json({'message':'Not proper format of attributes.'});
        return;
    }
    
    userID = tokens[token]["id"];
    db.one("SELECT * FROM forms WHERE id=$1 AND (forms.user_id=$2 OR forms.dog_id IN (SELECT dogs.id FROM dogs WHERE shelter_id = $2))",[form_id, userID])
    .then((data)=>{
        result = {
            "form_id": form_id,
            "dog_id": data.dog_id,
            "reason": data.reason,
            "details": data.details,
            "type": data.form_type,
            "created_at": data.created_at,
            //pridane po milestone 2
            "finished": data.finished
        }
        res.json(result);
    })
    .catch((error)=>{
        console.log(error)
        res.status(404).json({"message" : "No data found"})
    })
})
app.get('/forms/getAll',(req,res)=>{
    token = req.query.token;
    if (!check_token(token, res))
        return

    db.many("SELECT * FROM forms WHERE user_id=$1 OR forms.dog_id IN (SELECT dogs.id FROM dogs WHERE shelter_id = $1) ORDER BY id",[tokens[token]["id"]])
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
        res.status(404).json({"message": "No data found"})
    })
})
// editovanie formulara
app.put('/forms/edit',(req,res)=>{
    token = req.query.token;
    if (!check_token(token, res))
        return;

    userID = tokens[token]["id"]; 
    shelter = tokens[token]["shelter"];
    formId = req.query.form_id;
    reason = req.query.reason;
    details = req.body.details;
    finished = req.body.finished;
    if (formId == undefined || reason == undefined || finished == undefined) {
        res.status(404).json({"message": "Not all attributes provided"});
        return;
    }

    if (shelter == true) {
        res.status(401).json({"message": "Signed user is a shelter"});
        return;
    }

    if (isNaN(parseInt(formId))) {
        res.status(400).json({'message':'Not proper format of attributes.'});
        return;
    }

    db.one("UPDATE forms SET details = $1, finished = $2, reason = $3 WHERE id=$4 AND user_id = $5 RETURNING id", [details,finished,reason,formId, userID])
    .then((data)=>{
        res.status(200).json({"message":"OK"})
    })
    .catch((error)=>{
        res.status(404).json({"message":"No data to be updated"})
    })
})
// vymazanie formulara
app.delete('/forms/delete',(req,res)=>{
    token = req.query.token;
    form_id = req.query.form_id;
    if (!check_token(token, res))
        return

    if (form_id == undefined) {
        res.status(404).json({"message": "Not all attributes provided"});
        return;
    }

    if (isNaN(parseInt(form_id))) {
        res.status(400).json({'message':'Not proper format of attributes.'});
        return;
    }

    userID = tokens[token]["id"];
    db.one("DELETE from forms WHERE id=$2 AND (forms.user_id=$1 OR forms.dog_id IN (SELECT dogs.id FROM dogs WHERE shelter_id = $1)) RETURNING dog_id, finished",[userID,form_id])
    .then((data)=>{
        if (data.finished == true) {
            db.any("DELETE FROM terms WHERE dog_id = $1 and form_id = $2", [data.dog_id, form_id])
            .then((data) => res.status(200).json({"message":"OK"}))
            .catch((error)=> res.status(404).json({"message":"No data to be deleted"}))
        }
        else {
            db.any("UPDATE terms SET form_id = null, user_id = null, free = true WHERE dog_id = $1 and form_id = $2", [data.dog_id, form_id])
            .then((data) => res.status(200).json({"message":"OK"}))
            .catch((error)=> res.status(404).json({"message":"No data to be updated"}))
        }       
    })
    .catch((error)=>{
        res.status(404).json({"message": "No data to be deleted"});
    })
})
// vytvorenie terminov pre psa
app.post('/terms/create',(req,res)=>{
    token = req.query.token;
    userID = tokens[token]["id"];
    shelter = tokens[token]["shelter"]
    dog_id = req.query.dog_id;
    if (!check_token(token, res))
        return;

    if (dog_id == undefined) {
        res.status(404).json({"message": "Not all attributes provided"});
        return;
    }

    if (shelter == false) {
        res.status(401).json({"message": "Signed user is not a shelter"});
        return;
    }

    if (isNaN(parseInt(dog_id))) {
        res.status(400).json({'message':'Not proper format of attributes.'});
        return;
    }

    //ziskam posledny formular pre psa
    var time = undefined
    db.one("SELECT time from terms WHERE dog_id=$1 AND terms.dog_id IN (SELECT dogs.id FROM dogs WHERE shelter_id = $2) ORDER BY time DESC LIMIT 1",[dog_id, userID])
    .then((data) => {
        time = data.time
        insert_terms(dog_id,time)
    })
    .catch((error)=>{
        insert_terms(dog_id,new Date())
    })
    res.status(200).json({"message": "OK"})

})
function insert_terms(dog_id, time){
    var today;
    today = new Date(time)
    var date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate();
    for(let i=1;i<=7;i++){
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
    if (!check_token(token, res)) 
        return;

    free = req.body.free
    if (term_id == undefined || free == undefined) {
        res.status(404).json({"message": "Not all attributes provided"});
        return;
    }

    if (isNaN(parseInt(term_id))) {
        res.status(400).json({'message':'Not proper format of attributes.'});
        return;
    }

    user_id = tokens[token]["id"]
    db.one("UPDATE terms SET free=$1, user_id=$2 WHERE id=$3 RETURNING id",[free,user_id,term_id])
    .then((data)=>{
        res.status(200).json({"message": "OK"})
    })
    .catch((error)=>{
        res.status(404).json({"message": "No data to be updated"})
    })
})

//nacitanie obrazku psa
app.get('/image', (req, res) => {
    token = req.query.token;
    dog_id = req.query.dog_id;
    if (!check_token(token, res))
        return

    if (dog_id == undefined) {
        res.status(404).json({"message": "Not all attributes provided"});
        return;
    }

    if (isNaN(parseInt(dog_id))) {
        res.status(400).json({'message':'Not proper format of attributes.'});
        return;
    }

    userID = tokens[token]["id"]
    shelter = tokens[token]["shelter"]
    if (shelter == true) {
        db.one('SELECT * FROM dogs WHERE dogs.id = $1 AND dogs.shelter_id = $2', [dog_id, userID])
        .then((data) => {
            var raw_data = data.image_data
            if(raw_data == null){
                raw_data = ''
            }
            image_info = {
                "type": data.image_type,
                "name": data.image_name,
                "data": raw_data.toString('base64')
            }
            console.log(image_info)
            res.json(image_info)
        })
        .catch((error)=>{
            console.log(error)
            res.status(404).json({'message':'No data found'})
        })
    }
    else {
        db.one('SELECT * FROM dogs WHERE dogs.id = $1', [dog_id])
        .then((data) => {
            console.log(data)
            var raw_data = data.image_data
            if(raw_data == null){
                raw_data = ''
            }
            image_info = {
                "type": data.image_type,
                "name": data.image_name,
                "data":raw_data.toString('base64'),
                "message": "ok"
            }
            console.log(image_info)
            res.json(image_info)
        })
        .catch((error)=>{
            console.log(error)
            res.status(404).json({'message':'No data found'})
        })
    }
    
})

//nahratie obrazku psa
app.post('/image/insert', upload.single('file'), (req, res) => {
    token = req.query.token;
    dog_id = req.query.dog_id;
    if (!check_token(token, res))
        return;

    shelter = tokens[token]["shelter"];
    if (req.file == undefined || dog_id == undefined) {
        res.status(404).json({"message": "Not all attributes provided"});
        return;
    }

    if (shelter == false) {
        res.status(401).json({"message": "Signed user is not a shelter"});
        return;
    }

    if (isNaN(parseInt(dog_id))) {
        res.status(400).json({'message':'Not proper format of attributes.'});
        return;
    }

    type = req.file.mimetype;
    image_name = req.file.originalname;
    image_data = req.file.buffer;
    userID = tokens[token]["id"];
    db.one("UPDATE dogs SET image_type = $1, image_name = $2, image_data = $3 WHERE id = $4 AND shelter_id = $5 RETURNING id", [type, image_name, image_data, dog_id, userID])
    .then((data) => {
        console.log(data)
        res.json(data)
    })
    .catch((error)=>{
        console.log(error)
        res.status(404).json({'message':'No data to be updated'})
    })
})

//odhlasenie pouzivatela
app.get('/users/logout', (req, res) => {
    token = req.query.token;
    if (!check_token(token, res))
        return
    
    tokens[token] = undefined;
    console.log("Pohodka");
    res.status(200).json({"message": "OK"});
})

app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
})