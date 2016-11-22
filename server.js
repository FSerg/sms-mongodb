var async = require("async");
var url = require("url");
var querystring = require('querystring');
var request = require("request");
var xml2js  = require('xml2js');
var cron = require('node-cron');
var moment = require('moment');
var isDBREADY = false;

if (process.env.NODE_ENV === 'production') { var config = require('./config'); }
else { var config = require('./config-dev'); }

var passport = require('passport');
var Strategy = require('passport-http-bearer').Strategy;

passport.use(new Strategy(
  function(token, cb) {
      if (token === config.token) {
          // console.log("token ok");
          return cb(null, 'OK!');
      }
      // console.log("token not ok");
      return cb('Incorrect token!');
}));

var parser = new xml2js.Parser();
var express  = require('express');
var https = require( "https" );  // для организации https
var fs = require( "fs" );
var bodyParser = require('body-parser');
var app = express();
app.use(bodyParser.json());

var httpsOptions = {
    key: fs.readFileSync("key.pem"), // путь к ключу
    cert: fs.readFileSync("cert.pem") // путь к сертификату
};

var form =  {
    userName: config.sms_username,
    password: config.sms_password,
    isFlash: 'false',
    lifeTime: '1',
    destNumber: '',
    senderAddr: config.sms_sender,
    text: ''
};

var mongoose = require('mongoose');

// MONGODB 
var smsSchema = new mongoose.Schema({
		tel: { type: String, index: true },
		text: String,
		isSent: Boolean,
        isOK: Boolean,
        answer: String,
        createdAt: { type: Date, index: true },
        sentAt: Date
	}, { strict: false });

var SMS = mongoose.model('sms', smsSchema);

mongoose.Promise = global.Promise;
mongoose.connect(config.MONGO_URL, function(err) {
    //console.log('Connection string: '+config.MONGO_URL); // for debugging only
    if (err) {
        console.log(err);
    } else {
        console.log('Start - ' + Date());
        console.log('Connected to MongoDB (from start)!');

        // start sending every 1 minute
        cron.schedule('*/1 * * * *', function(){
            console.log('Select SMS - ' + Date());
            FindSMS();
        });
    }
});

// If the connection throws an error
mongoose.connection.on("error", function(err) {
  console.error('Failed to connect to DB on startup ', err);
  isDBREADY = false;
});

// When the connection is disconnected
mongoose.connection.on('disconnected', function () {
  console.log('Mongoose default connection to DB disconnected');
  isDBREADY = false;
});

mongoose.connection.on("connected", function(ref) {
  console.log("Connected to DB!");
  isDBREADY = true;
});

//GET method route
// app.get('/test', passport.authenticate('bearer', { session: false }), function(req, res) {
//     res.send({result: 'Everithing ok :)'});
// });

// POST method route
app.post('/sms', passport.authenticate('bearer', { session: false }), function (req, res) {

    // chek DB status
    if (!isDBREADY) {
        res.status(400).send('DB is not ready!');
    }

    var data_from1C = req.body;
    console.log('data from 1C:');
    console.log(data_from1C);

    // check 'array' field existence
    if (data_from1C.array === undefined) {
        console.log('Can not detect array of SMS in the body of POST-request');
        res.status(400).send('Can not detect array of SMS in the body of POST-request');
    }

    // write data in DB
    async.each(data_from1C.array, function(data, callback) {

        console.log('Date ' + new Date());
        console.log('Processing sms: ' + JSON.stringify(data, {indent: true}));

        var new_sms = new SMS(data);
        new_sms.createdAt = new Date();
        new_sms.isSent = false;
        new_sms.isOK = false;
        new_sms.answer = '';
        new_sms.save(function(err) {
            if (err) {
                console.log('Error save sms in database: ' + err);
                callback(err);
            }
            else {
                console.log('Sms processed');
                callback();
            }
        }); // end save to MongoDB

    }, function(err) {
        if( err ) {
            console.log(err);
            res.status(500).send(err);
        } else {
            console.log('All sms processed successfully');
            res.status(200).send('OK');
        }
    });
});

//GET method route
// app.get('/getsms', function(req, res) {
//     res.send('ok');
//     console.log('Start - ' + Date());
//     cron.schedule('*/2 * * * *', function(){
//         console.log('Select SMS - ' + Date());
//         FindSMS();
//     });
// });

function FindSMS(){
    // ищем список неотправленных СМСок
    SMS.find({isSent: false}, function (err, finded_sms, count ){
        async.eachSeries(finded_sms, function(my_sms, callback) {
            console.log('sms - ' + my_sms._id); //only debug
            callback(); //only debug
            //SendSMS(my_sms, callback);
        }, function(err) {
            // if any of the file processing produced an error, err would equal that error
            if(err) {
                // One of the iterations produced an error.
                // All processing will now stop.
                console.log('Error: ');
                console.log(err);
            } else {
                console.log('All sms processed successfully');
            }
            //console.log('done!');
        });
    });
}

function SendSMS(smska, callback) {

    form.text = smska.text;
    form.destNumber = smska.tel.replace(/[^0-9]/gim, '');
    var formData2 = querystring.stringify(form);
    var contentLength2 = formData2.length;

    request({
        headers: {
            'Content-Length': contentLength2,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        url: config.sms_url,
        body: formData2,
        method: 'POST'
    }, function(error, response, body) {
        if (error) {
            console.log('Can not perform request to the SMS service: ');
            callback();
        } else {
            ParseAnswer(body, smska, callback);
        }
    });
}

function ParseAnswer(answer, smska, callback) {
    parser.parseString(answer, function (err, result) {
        if (err) {
            console.log('Can not parse answer string: ');
            console.log(err);
            callback();
        } else {
            MessageResult = result['MessageResponse']['Result'];
            MessageID = result['MessageResponse']['MessageID'];

            isNotError = false;
            console.log(MessageResult);
            var errorMessage = '';
            switch(String(MessageResult)) {
                  case 'OK':
                    isNotError = true;
                    errorMessage = 'Сообщение отправлено';
                    break;

                // Неверное имя пользователя или пароль
                  case 'InvalidCredentials':
                    errorMessage = 'Неверное имя пользователя или пароль';
                    break;

                // Неверный номер отправителя
                case 'InvalidSenderAddress':
                    errorMessage = 'Неверный номер отправителя';
                    break;

                //Неверный номер получателя
                case 'InvalidReceiverAddress':
                    errorMessage = 'Неверный номер получателя';
                    break;

                //Неверное значение параметра Flash
                case 'InvalidFlashMessage':
                    errorMessage = 'Неверное значение параметра Flash';
                    break;

                //Сообщение заблокировано
                case 'MessageBlocked':
                    errorMessage = 'Сообщение заблокировано';
                    break;

                //Недостаточно средств на лицевом счете
                case 'InvalidBalance':
                    errorMessage = 'Недостаточно средств на лицевом счете';
                    break;

                //Аккаунт отключен
                case 'UserDisabled':
                    errorMessage = 'Аккаунт отключен';
                    break;

                //Ошибка хранилища данных.
                case 'DatabaseOffline':
                    errorMessage = 'Ошибка БД. Попробуйте повторить запрос позже';
                    break;

                //Незнакомая ошибка
                case 'UnKnown':
                    errorMessage = 'Незнакомая ошибка. Свяжитесь со службой поддержки';
                    break;

                //Ошибка сервиса
                case 'Error':
                    errorMessage = 'Внутренняя ошибка сервиса. Свяжитесь со службой поддержки';
                    break;

               //Неизвестный нам ответ
                default:
                    errorMessage = 'Неверный ответ от сервера';
                    break;
                }

                console.log('SMS MessageID = ' + MessageID + ' - ' + errorMessage);

                //change 'Status' to True
                smska.isSent = true;
                smska.isOK = isNotError;
                smska.answer = errorMessage;
                smska.sentAt = new Date();
                smska.save(function (err) {
                    if (err) {
                        console.log('Can not update SMSinfo in the DB');
                        console.log(err);
                        callback();
                    } else {
                        console.log('Sms processed successfully');
                        callback();
                    }
                });
        }
    });
}

// app.listen(config.port, function () {
//   console.log('App listening on port: '+config.port);
// });

https.createServer(httpsOptions, app).listen(config.port, function() {
    console.log('Server listening on port %d in %s mode', config.port, process.env.NODE_ENV);
});
