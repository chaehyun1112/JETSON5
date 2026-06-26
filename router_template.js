
const router = express.Router();

app.use("/",router);

const express = require("express")




//EJS사용할떄는 path를 사용하지않음
const path = require("path");


router.get("/",(req,res)=>{

    
})









router.post("/join",(req,res)=>{
    // 값을 넘겨받는 라우터는 반드시 값을 먼저 확인(매우중요)
    console.log(req.body);
})


module.exports = router;