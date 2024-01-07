import { body } from "express-validator";

const identifyValidateDate = [
  body("fullname")
    .trim()
    .escape()
    .notEmpty()
    .withMessage("Você precisa preencher seu nome"),
  body("email")
    .trim()
    .escape()
    .notEmpty()
    .withMessage("Você precisa preencher seu email"),
  body("cpf")
    .trim()
    .escape()
    .notEmpty()
    .withMessage("Você precisa preencher seu cpf"),
  body("cellphone")
    .trim()
    .escape()
    .notEmpty()
    .withMessage("Você precisa preencher seu celular"),
];

export default identifyValidateDate;
