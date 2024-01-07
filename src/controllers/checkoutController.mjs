import {
  ApiError,
  CustomersController,
  PlansController,
} from "@pagarme/pagarme-nodejs-sdk";
import client from "../../api/utils/pgmeClient.mjs";
import base64 from "base-64";

export default class CheckoutController {
  static async identify(req, res) {
    //remember to change planId to itemId and then verify if it's a pack or a plan that'll be bought
    const userId = req.params.id;
    const planId = req.params.planId;

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

      req.session.userId = userId;
      req.session.plan = plan;
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
    let bodySubscriptionOrder;

    try {
      const plansController = new PlansController(client);
      const { result, ...httpResponse } = await plansController.getPlan(
        req.session.plan.id
      );

      // console.log(result);

      // bodySubscriptionOrder = {
      //   code: "123",
      //   customer: req.session.customer,
      //   billingType: result.billingType,
      //   statementDescriptor: result.statementDescriptor,
      //   description: result.description,
      //   currency: result.currency,
      //   interval: result.interval,
      //   intervalCount: result.intervalCount,
      //   pricingScheme: {
      //     schemeType: result.items[0].pricingScheme.schemeType,
      //     price: result.items[0].pricingScheme.price,
      //   },
      //   items: [
      //     {
      //       id: result.items[0].id,
      //       planItemId: req.session.plan.id,
      //       name: result.name,
      //       description: result.description,
      //       pricingScheme: {
      //         schemeType: result.items[0].pricingScheme.schemeType,
      //         price: result.items[0].pricingScheme.price,
      //       },
      //       discounts: [],
      //       quantity: 1,
      //     },
      //   ],
      //   shipping: {
      //     amount: 1,
      //     description: "Won't be shipped",
      //     recipientName: "",
      //     recipientPhone: "",
      //     addressId: "",
      //     address: req.session.customer.address,
      //     type: "",
      //   },
      //   discounts: [],
      //   increments: [],
      //   metadata: {},
      //   paymentMethod: "credit_card",
      //   card: {
      //     number: number,
      //     holderName: holder_name,
      //     holderDocument: req.session.customer.document,
      //     expMonth: exp_month,
      //     expYear: exp_year,
      //     cvv: cvv,
      //     billingAddress: req.session.customer.address,
      //   },
      // installments: 1,
      // };

      const addressObj = req.session.customer.address;

      bodySubscriptionOrder = {
        code: result.id,
        plan_id: result.id,
        customer_id: req.session.customer.id,
        payment_method: "credit_card",
        card: {
          number: number,
          holder_name: holder_name,
          holder_document: req.session.customer.document,
          exp_month: exp_month,
          exp_year: exp_year,
          cvv: cvv,
          billing_address: {
            line_1: addressObj.line1,
            line_2: addressObj.line2,
            zip_code: addressObj.zipCode,
            city: addressObj.city,
            state: addressObj.state,
            country: addressObj.country
          },
        },
        installments: 1,
      };
    } catch (err) {
      if (err instanceof ApiError) {
        console.log(err);
      }
      throw new Error(err);
    }

    try {
      // const subscriptionController = new SubscriptionsController(client);
      // const { result, ...httpResponse } = await subscriptionController.createSubscription(bodySubscriptionOrder);
      // console.log(result);
      // console.log(httpResponse);
      const user = process.env.PGMSK;
      const password = "";

      console.log(JSON.stringify(bodySubscriptionOrder));

      const response = await fetch('https://api.pagar.me/core/v5/subscriptions', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${base64.encode(`${user}:${password}`)}`,
        },
        body: JSON.stringify(bodySubscriptionOrder),
      });

      const data = await response.json();
      console.log(data);

      res.render("checkout/success");
    } catch (err) {
      if (err instanceof ApiError) {
        console.log(err);
      }
      throw new Error(err);
    }
  }
}
