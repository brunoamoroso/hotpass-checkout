import {
  ApiError,
  CustomersController,
  PlansController,
} from "@pagarme/pagarme-nodejs-sdk";
import client from "../utils/pgmeClient.mjs";
import base64 from "base-64";
import axios from "axios";
import { configDotenv } from "dotenv";
import { getModelByTenant } from "../utils/tenantUtils.mjs";
import packSchema from "../schemas/Pack.mjs";
import botConfigSchema from "../schemas/BotConfig.mjs";

configDotenv();

export default class CheckoutController {
  static async identify(req, res) {
    const userId = req.params.id;
    const itemId = req.params.itemId;
    let customerExists = false;
    let item = {};
    const priceFormat = new Intl.NumberFormat("pt-br", {
      style: "currency",
      currency: "BRL",
    });

    let stepper = {
      step1: {
        status: "active",
        label: '1',
      },
      step2: {
        status: "",
        label: "2",
      },
      step3: {
        status: "",
        label: "3",
      },
      step4: {
        status: "",
        label: "4",
      },
    };

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

      try {
        const customerController = new CustomersController(client);
        const { result, ...httpResponse } = await customerController.getCards(
          req.session.customer.id
        );

        req.session.customerCards = result.data;
        customerExists = true;
        stepper = {
          step1: {
            status: "done",
            label: '<i class="bi bi-check-lg"></i>',
          },
          step2: {
            status: "done",
            label: '<i class="bi bi-check-lg"></i>',
          },
          step3: {
            status: "done",
            label: '<i class="bi bi-check-lg"></i>',
          },
          step4: {
            status: "active",
            label: "4",
          },
        };
      } catch (err) {
        if (err instanceof ApiError) {
          console.log(err);
          return;
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        console.log(err);
      }
      throw new Error(err);
    }

    if (itemId.includes("plan")) {
      try {
        const plansController = new PlansController(client);
        const { result } = await plansController.getPlan(itemId);

        item = {
          id: result.id,
          name: result.name,
          price: priceFormat.format(result.items[0].pricingScheme.price / 100),
          type: "subscription",
        };

        req.session.item = item;
      } catch (err) {
        if (err instanceof ApiError) {
          console.log(err);
        }
        throw new Error(err);
      }
    } else {
      //if it's a pack
      try {
        const Packs = getModelByTenant(
          req.session.botName + "db",
          "Packs",
          packSchema
        );
        const pack = await Packs.findById(itemId).lean();

        item = {
          id: pack._id,
          name: pack.title,
          price: priceFormat.format(pack.price / 100),
          amount: pack.price,
          type: "pack",
        };

        req.session.item = item;
      } catch (err) {
        console.log(err);
      }
    }

    if (customerExists) {
      res.render("checkout/review", {
        item,
        customer: req.session.customer,
        customerCards: req.session.customerCards,
        customerExists,
        stepper
      });
      return;
    }

    res.render("checkout/identify", { item, stepper });
  }

  static async identifyPost(req, res) {
    const { fullname, email, cpf, cellphone } = req.body;
    const item = req.session.item;
    const userId = req.session.userId;

    const stepper = {
      step1: {
        status: "done",
        label: '<i class="bi bi-check-lg"></i>',
      },
      step2: {
        status: "active",
        label: "2",
      },
      step3: {
        status: "",
        label: "3",
      },
      step4: {
        status: "",
        label: "4",
      },
    };

    //start to prepare to register the user
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

    res.render("checkout/address", { item, stepper });
  }

  static async addressPost(req, res) {
    const stepper = {
      step1: {
        status: "done",
        label: '<i class="bi bi-check-lg"></i>',
      },
      step2: {
        status: "done",
        label: '<i class="bi bi-check-lg"></i>',
      },
      step3: {
        status: "active",
        label: "3",
      },
      step4: {
        status: "",
        label: "4",
      },
    };

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
        res.render("checkout/payment", { item: req.session.item, stepper });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        console.log(err);
      }
      throw new Error(err);
    }
  }

  static async paymentPost(req, res) {
    const stepper = {
      step1: {
        status: "done",
        label: '<i class="bi bi-check-lg"></i>',
      },
      step2: {
        status: "done",
        label: '<i class="bi bi-check-lg"></i>',
      },
      step3: {
        status: "done",
        label: '<i class="bi bi-check-lg"></i>',
      },
      step4: {
        status: "active",
        label: "4",
      },
    };

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

      const responseCreateCard = await fetch(
        `https://api.pagar.me/core/v5/customers/${req.session.customer.id}/cards`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${base64.encode(`${user}:${password}`)}`,
          },
          body: JSON.stringify(bodyCreateCard),
        }
      );

      const dataCard = await responseCreateCard.json();
      req.session.customerCards = dataCard;

      const customerExists = true;

      res.render("checkout/review", {
        item: req.session.item,
        customer: req.session.customer,
        customerCards: dataCard,
        customerExists,
        stepper
      });
    } catch (err) {
      if (err instanceof ApiError) {
        console.log(err);
      }
      throw new Error(err);
    }
  }

  static async confirmPayment(req, res) {
    const user = process.env.PGMSK;
    const password = "";

    const botConfig = getModelByTenant(
      req.session.botName + "db",
      "BotConfig",
      botConfigSchema
    );
    const BotConfigs = await botConfig.findOne().lean();

    if (req.session.item.type === "subscription") {
      try {
        const bodySubscriptionOrder = {
          code: req.session.item.id,
          plan_id: req.session.item.id,
          customer_id: req.session.customer.id,
          payment_method: "credit_card",
          card_id: req.session.customerCards[0].id,
          installments: 1,
          split: {
            enabled: true,
            rules: BotConfigs.split_rules,
          },
        };

        await fetch("https://api.pagar.me/core/v5/subscriptions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${base64.encode(`${user}:${password}`)}`,
          },
          body: JSON.stringify(bodySubscriptionOrder),
        }).then((resp) => {
          if (resp.status === 200) {
            const webhookURL = process.env.BOTS_DOMAIN + req.session.botName;
            const data = {
              customer_chat_id: req.session.customer.code,
              customer_pgme_id: req.session.customer.id,
              plan_pgme_id: req.session.item.id,
              type_item_bought: "subscription",
              bot_name: req.session.botName,
            };
            axios.post(webhookURL, data);
          }
          return resp.json();
        });
      } catch (err) {
        throw new Error(err);
      }
    }

    if (req.session.item.type === "pack") {
      try {
        const bodyPackOrder = {
          code: req.session.customer.id,
          customer_id: req.session.customer.id,
          items: [
            {
              amount: req.session.item.amount,
              description: "Pack",
              quantity: 1,
              code: req.session.item.id,
            },
          ],
          payments: [
            {
              payment_method: "credit_card",
              credit_card: {
                card_id: req.session.customerCards[0].id,
              },
              amount: req.session.item.amount,
              split: BotConfigs.split_rules,
            },
          ],
          closed: true,
        };

        await fetch("https://api.pagar.me/core/v5/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${base64.encode(`${user}:${password}`)}`,
          },
          body: JSON.stringify(bodyPackOrder),
        }).then((resp) => {
          if (resp.status === 200) {
            const webhookURL = process.env.BOTS_DOMAIN + req.session.botName;
            const data = {
              customer_chat_id: req.session.customer.code,
              customer_pgme_id: req.session.customer.id,
              pack_id: req.session.item.id,
              type_item_bought: "pack",
              bot_name: req.session.botName,
            };
            axios.post(webhookURL, data);
          }

          return resp.json();
        });
      } catch (err) {
        console.log(err);
      }
    }
  }
}
