import {
  ApiError,
  CustomersController,
  PlansController,
} from "@pagarme/pagarme-nodejs-sdk";
import client from "../utils/pgmeClient.mjs";
import base64 from "base-64";
import axios from 'axios';
import { configDotenv } from "dotenv";

configDotenv();

export default class CheckoutController {
  static async identify(req, res) {
    //remember to change planId to itemId and then verify if it's a pack or a plan that'll be bought
    const userId = req.params.id;
    const planId = req.params.planId;
    let customerExists = false;

    req.session.botName = req.params.botName;
    req.session.userId = userId;

    try {
      const customerController = new CustomersController(client);
      const { result, ...httpResponse } = await customerController.getCustomers(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        userId,
        undefined
      );

      req.session.customer = result.data[0];
      customerExists = true;
    } catch (err) {
      if (err instanceof ApiError) {
        console.log(err);
      }
      throw new Error(err);
    }

    try {
      const plansController = new PlansController(client);
      const { result } = await plansController.getPlan(planId);

      const priceFormat = new Intl.NumberFormat("pt-br", {
        style: "currency",
        currency: "BRL",
      });

      const plan = {
        id: result.id,
        name: result.name,
        price: priceFormat.format(result.items[0].pricingScheme.price / 100),
      };

      req.session.plan = plan;

      if (customerExists) {
        try {
          const customerController = new CustomersController(client);
          const { result, ...httpResponse } =
            await customerController.getCards(req.session.customer.id);

          req.session.customerCards = result.data;
          customerExists = true;
        } catch (err) {
          if (err instanceof ApiError) {
            console.log(err);
          }
          throw new Error(err);
        }

        res.render("checkout/review", { plan, customer: req.session.customer, customerCards: req.session.customerCards, customerExists });
        return;
      }

      res.render("checkout/identify", { plan });
    } catch (err) {
      if (err instanceof ApiError) {
        console.log(err);
      }
      throw new Error(err);
    }
  }

  static async identifyPost(req, res) {
    const errors = validationResult(req);
    const result = validationResult(req).mapped();
    const { fullname, email, cpf, cellphone } = req.body;
    let fieldErrors = {};
    const plan = req.session.plan;
    const userId = req.session.userId;

    // validated the fields and then render if necessary
    if (!errors.isEmpty()) {
      for (const error in result) {
        if (result.hasOwnProperty(error)) {
          fieldErrors[error] = true;
        }
      }
      res.render("checkout/identify", { result, fieldErrors, plan });
      return;
    }

    //register the user if it doesn't exist

    const ddd = cellphone.slice(0, 2);
    const phone = cellphone.slice(2, 11);

    const bodyCustomer = {
      code: userId,
      name: fullname,
      email: email,
      document: cpf,
      documentType: "CPF",
      type: "individual",
      phones: {
        mobilePhone: {
          countryCode: "55",
          areaCode: ddd,
          number: phone,
        },
      },
      address: {},
      metadata: {},
    };

    req.session.customer = bodyCustomer;

    res.render("checkout/address", { plan });
  }

  static async addressPost(req, res) {
    const { zipcode, city, uf, neighborhood, street, number, complement } =
      req.body;
    let customer = req.session.customer;
    customer.address = {
      line1: street.concat(", ", neighborhood, ", ", number),
      line2: complement,
      street: street,
      number: number,
      neighborhood: neighborhood,
      complement: complement,
      zipCode: zipcode,
      city: city,
      state: uf,
      country: "BR",
      metadata: {},
    };

    try {
      const customerController = new CustomersController(client);
      const { result, ...httpResponse } =
        await customerController.createCustomer(customer);

      if (httpResponse.statusCode === 200 || httpResponse.statusCode === 201) {
        req.session.customer.id = result.id;
        req.session.customer = customer;
        res.render("checkout/payment", { plan: req.session.plan });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        console.log(err);
      }
      throw new Error(err);
    }
  }

  static async paymentPost(req, res) {
    const { number, holder_name, due, cvv } = req.body;
    const exp_month = parseInt(due.slice(0, 2));
    const exp_year = parseInt(due.slice(3, 5));

    try {

      const bodyCreateCard = {
        number: number,
        holder_name: holder_name,
        holder_document: req.session.customer.document,
        exp_month: exp_month,
        exp_year: exp_year,
        cvv: cvv,
        billing_address_id: req.session.customer.address.id,
      };

      const user = process.env.PGMSK;
      const password = "";

      const responseCreateCard = await fetch(`https://api.pagar.me/core/v5/customers/${req.session.customer.id}/cards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${base64.encode(`${user}:${password}`)}`,
        },
        body: JSON.stringify(bodyCreateCard),
      });

      const dataCard = await responseCreateCard.json();
      req.session.customerCards = dataCard;

      const customerExists = true;

      res.render("checkout/review", {plan: req.session.plan, customer: req.session.customer, customerCards: dataCard, customerExists });
    } catch (err) {
      if (err instanceof ApiError) {
        console.log(err);
      }
      throw new Error(err);
    }
  }

  static async confirmPayment(req, res){
    try{
      // const addressObj = req.session.customer.address;
      const bodySubscriptionOrder = {
        code: req.session.plan.id,
        plan_id: req.session.plan.id,
        customer_id: req.session.customer.id,
        payment_method: "credit_card",
        card_id: req.session.customerCards[0].id,
        installments: 1,
      };

      const user = process.env.PGMSK;
      const password = "";

      const response = await fetch(
        "https://api.pagar.me/core/v5/subscriptions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${base64.encode(`${user}:${password}`)}`,
          },
          body: JSON.stringify(bodySubscriptionOrder),
        }
      ).then(resp => {
        if(resp.status === 200){
          const webhookURL = process.env.BOTS_DOMAIN + req.session.botName;
          const data = {
            customer_chat_id: req.session.customer.code,
            customer_pgme_id: req.session.customer.id,
            plan_pgme_id: req.session.plan.id,
            type_item_bought: "subscription",
            bot_name: req.session.botName,
          }
          axios.post(webhookURL, data);
        }
        return resp.json();
      });

    }catch (err) {
      throw new Error(err);
    }
  }
}
