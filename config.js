module.exports = {
  "port": process.env.PORT || 5000,
  "MONGO_URL": process.env.MONGO_URL || "mongodb://localhost:27017/testdb",
  "token": process.env.TOKEN,

  "sms_sender": process.env.SMS_SENDER || "SOME NAME",
  "sms_username": process.env.SMS_USERNAME,
  "sms_password": process.env.SMS_PASSWORD,
  "sms_url": process.env.SMS_URL || "http://ws1.smsdelivery.ru/SMSWebservice.asmx/SendMessage",
  //"sms_url_balance": process.env.SMS_URL_BALANCE || "http://ws1.smsdelivery.ru/SMSWebservice.asmx/GetBalance"
  "sms_url_balance": process.env.SMS_URL_BALANCE || "http://ws1.smsdelivery.ru/SMSWebservice.asmx/GetRoubleBalance"
};
