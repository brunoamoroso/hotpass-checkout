import {
  ApiError,
  CustomersController,
  OrdersController,
  PlansController,
  SubscriptionsController,
} from "@pagarme/pagarme-nodejs-sdk";
import client from "../utils/pgmeClient.mjs";
import base64 from "base-64";
import axios from "axios";
import { configDotenv } from "dotenv";
import { getModelByTenant } from "../utils/tenantUtils.mjs";
import packSchema from "../schemas/Pack.mjs";
import botConfigSchema from "../schemas/BotConfig.mjs";
import priceFormat from "../utils/priceFormat.mjs";

configDotenv();

const paymentTypes = [
  {
    icon: '<img src="/imgs/pix_logo.svg" alt="pix icon" height="16" />',
    name: "Pix",
    type: "pix",
  },
  {
    icon: '<i class="bi bi-credit-card-fill"></i>',
    name: "Cartão de Crédito",
    type: "credit_card",
  },
];

export default class CheckoutController {
  static fetchAuthKey() {
    const user = process.env.PGMSK;
    const password = "";
    return `Basic ${base64.encode(`${user}:${password}`)}`;
  }

  /**
   * This route serves to identify if the user exists in the pagar.me platform. If not it'll start to create the customer there
   */
  static async identify(req, res, next) {
    const userId = req.params.id;
    let itemId = req.params.itemId;

    let item = {};

    let stepper = {
      step1: {
        status: "active",
        label: "1",
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
    req.session.save();

    if (itemId.includes("plan")) {
      try {
        const plansController = new PlansController(client);
        const { result } = await plansController.getPlan(itemId);

        item = {
          id: result.id,
          name: result.name,
          price: priceFormat(result.items[0].pricingScheme.price),
          amount: result.items[0].pricingScheme.price,
          type: "subscription",
        };

        req.session.item = item;
        req.session.save();
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
          id: pack._id.toString(),
          name: pack.title,
          price: priceFormat(pack.price),
          amount: pack.price,
          type: "pack",
        };

        
        req.session.item = item;
        req.session.save();
        console.log(req.session.id);
      } catch (err) {
        console.log(err);
      }
    }

    try {
      const customerController = new CustomersController(client);
      const { result: customerResult } = await customerController.getCustomers(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        req.session.userId,
        undefined
      );

      // if customer doesn't exist
      if (customerResult.data.length === 0) {
        res.render("checkout/identify", { item, stepper });
        return;
      }

      req.session.customer = customerResult.data[0];
      req.session.save();

      next();
    } catch (err) {
      console.dir(err, { depth: null });
    }
  }

  /**
   *
   * This is mostly to contour a problem with users reminding of click "Confirmar Compra" on the review page while paying by pix. So when a customer comeback and has generate a pix and paid in the last 15 minutes it'll check and lead the customer to the success page
   */
  static async checkPixPaid(req, res, next) {
    // get all paid orders in the last 15 minutes, filter to check if one of them is equal with current plan or pack to confirm the payment and them workout the situation
    const createdSinceDate = new Date();
    createdSinceDate.setMinutes(createdSinceDate.getMinutes() - 15);

    const ordersController = new OrdersController(client);
    const { result: paidOrdersResult } = await ordersController.getOrders(
      undefined,
      undefined,
      req.session.item.id,
      "paid",
      createdSinceDate.toISOString(),
      undefined,
      req.session.customer.id
    );

    // if paid we send the user directly to the success
    const webhookURL = process.env.BOTS_DOMAIN + req.session.botName;
    let data = {};
    if (paidOrdersResult.data.length > 0) {
      if (req.session.item.type === "subscription") {
        data = {
          customer_chat_id: req.session.customer.code,
          plan_id: req.session.item.id,
          order_id: paidOrdersResult.data[0].id,
          type_item_bought: "subscription",
          bot_name: req.session.botName,
          payment_type: "pix",
        };
      }

      if (req.session.item.type === "pack") {
        data = {
          customer_chat_id: req.session.customer.code,
          pack_id: req.session.item.id,
          type_item_bought: "pack",
          bot_name: req.session.botName,
          payment_type: "pix",
        };
      }

      axios.post(webhookURL, data).catch((err) => {
        console.dir(err, { depth: null });
      });

      return res.redirect("/checkout/success");
    }

    // if there's a pending one it'll cancel
    const { result: pendingOrders } = await ordersController.getOrders(
      undefined,
      undefined,
      req.session.item.id,
      "pending",
      createdSinceDate.toISOString(),
      undefined,
      req.session.customer.id
    );

    // console.dir(pendingOrders, {depth: null});

    // pendingOrders.data.forEach(async (order, i) => {
    //   console.log(i);
    //   const ordersController = new OrdersController(client);
    //   const {result} = await ordersController.closeOrder(order.id, {status: "canceled"});
    //   console.dir(result, {depth: null})
    // });
    next();
  }

  /**
   * customerExists but hasn't paid a pix about this purchase yet, so the customer can choose a payment method
   */
  static async customerExists(req, res) {
    try {
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

      const customerController = new CustomersController(client);
      const { result: cardsResult } = await customerController.getCards(
        req.session.customer.id
      );

      const customerCards = cardsResult.data.map((card) => {
        card.customerId = req.session.customer.id;
        return card;
      });

      req.session.customerCards = customerCards;
      req.session.save();

      res.render("checkout/choosePayment", {
        item: req.session.item,
        customer: req.session.customer,
        customerCards: req.session.customerCards,
        stepper,
        paymentTypes,
      });
    } catch (err) {
      console.dir(err, { depth: null });
    }
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
    const ddd = cellphone.slice(1, 3);
    const phone = cellphone.slice(5, 15).replace("-", "");

    const bodyCustomer = {
      code: userId,
      name: fullname,
      email: email,
      document: cpf.replaceAll(".", "").replace("-", ""),
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
    req.session.save();

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
      number: number === "" ? "S/N" : number,
      neighborhood: neighborhood,
      complement: complement,
      zipCode: zipcode.replace("-", ""),
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
        req.session.save();

        return res.render("checkout/choosePayment", {
          paymentTypes,
          item: req.session.item,
          stepper,
        });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        console.log(err);
      }
      throw new Error(err);
    }
  }

  static async choosePaymentPost(req, res) {
    const { paymentMethods } = req.body || {};
    req.session.paymentMethod = paymentMethods;

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

    console.log(req.session.id);

    switch (paymentMethods) {
      case "pix":
        try {
          const botConfigsModel = getModelByTenant(
            req.session.botName + "db",
            "BotConfig",
            botConfigSchema
          );

          const botConfigs = await botConfigsModel.findOne().lean();

          const bodyPixOrder = {
            code: req.session.item.id,
            items: [
              {
                code: req.session.item.id,
                amount: req.session.item.amount,
                description: req.session.item.name,
                quantity: 1,
                category: req.session.item.type,
              },
            ],
            customer_id: req.session.customer.id,
            payments: [
              {
                payment_method: "pix",
                pix: {
                  expires_in: 900,
                  additional_information: [
                    {
                      name: req.session.item.name,
                      value: req.session.item.amount.toString(),
                    },
                  ],
                },
                split: botConfigs.split_rules,
              },
            ],
            closed: true,
          };

          const result = await fetch("https://api.pagar.me/core/v5/orders", {
            method: "POST",
            headers: {
              Authorization: CheckoutController.fetchAuthKey(),
            },
            body: JSON.stringify(bodyPixOrder),
          }).then(async (resp) => {
            return await resp.json();
          });

          const qrCode = {
            img: result.charges[0].last_transaction.qr_code_url,
            code: result.charges[0].last_transaction.qr_code,
          };

          res.render("checkout/review", {
            reviewView: true,
            item: req.session.item,
            customer: req.session.customer,
            qrCode,
            stepper,
            dynamicURL: process.env.CHECKOUT_DOMAIN,
          });
          return;
        } catch (err) {
          console.log(err);
        }
        break;

      case "credit_card":
        try {
          if (req.session.customerCards.length > 0) {
            res.render("checkout/review", {
              reviewView: true,
              item: req.session.item,
              customer: req.session.customer,
              customerCards: req.session.customerCards,
              stepper,
              dynamicURL: process.env.CHECKOUT_DOMAIN,
            });
            return;
          }

          res.redirect(`newCard/${req.session.customer.id}`);
        } catch (err) {
          console.log(err);
        }
        break;
    }
  }

  static async createCardPost(req, res) {
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

    if (req.session.customer.document === undefined) {
      try {
        const customerController = new CustomersController(client);
        const { result, ...httpResponse } =
          await customerController.getCustomer(req.session.customer.id);

        req.session.customer = result;
        req.session.save();
      } catch (err) {
        throw Error(err);
      }
    }

    const { number, holder_name, due, cvv } = req.body;
    const exp_month = parseInt(due.slice(0, 2));
    const exp_year = parseInt(due.slice(3, 5));

    try {
      const bodyCreateCard = {
        number: number,
        holderName: holder_name,
        holderDocument: req.session.customer.document,
        expMonth: exp_month,
        expYear: exp_year,
        cvv: cvv,
        billingAddressId: req.session.customer.address.id,
      };

      const customerController = new CustomersController(client);
      const { result, ...httpResponse } = await customerController.createCard(
        req.session.customer.id,
        bodyCreateCard
      );

      console.dir(result, { depth: null });

      let customerCards;
      try {
        const customerController = new CustomersController(client);
        const { result, ...httpResponse } = await customerController.getCards(
          req.session.customer.id
        );

        customerCards = result.data;
        customerCards.map((card) => {
          card.customerId = req.session.customer.id;
          return card;
        });
        req.session.customerCards = customerCards;
        req.session.save();

        res.render("checkout/review", {
          reviewView: true,
          item: req.session.item,
          customer: req.session.customer,
          customerCards: customerCards,
          customerExists: true,
          stepper,
          dynamicURL: process.env.CHECKOUT_DOMAIN,
        });
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.dir(err, { depth: null });
      let errorMsg = "Ocorreu um problema ao tentar criar o seu cartão de crédito. Verifique os dados e tente novamente.";

      if(err.result.message === "Could not create credit card. The card verification failed."){
        errorMsg = "Não foi possíel criar o seu cartão de crédito. O emissor do cartão recusou o seu uso."
      }

      res.render(`checkout/newCard`, {
        item: req.session.item,
        customer: req.session.customer,
        stepper,
        error: errorMsg,
      });
      return;
    }
  }

  static async confirmPayment(req, res) {
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

    const BotConfigsModel = getModelByTenant(
      req.session.botName + "db",
      "BotConfig",
      botConfigSchema
    );
    const botConfigs = await BotConfigsModel.findOne().lean();
    const webhookURL = process.env.BOTS_DOMAIN + req.session.botName;

    if (req.session.paymentMethod === "pix") {
      try {
        const orderController = new OrdersController(client);
        const { result, ...httpResponse } = await orderController.getOrder(
          req.session.orderId
        );

        if (result.status === "paid") {
          if (req.session.item.type === "subscription") {
            const data = {
              customer_chat_id: req.session.customer.code,
              plan_id: req.session.item.id,
              order_id: result.id,
              type_item_bought: "subscription",
              bot_name: req.session.botName,
            };

            axios.post(webhookURL, data).catch((err) => {
              console.log(err);
            });
            return res.redirect("success");
          }

          if (req.session.item.type === "pack") {
            const data = {
              customer_chat_id: req.session.customer.code,
              pack_id: req.session.item.id,
              type_item_bought: "pack",
              bot_name: req.session.botName,
            };
            axios.post(webhookURL, data);
            return res.redirect("success");
          }
        }

        throw new Error("Pix not paid yet");
      } catch (err) {
        console.log(err);
        let alertMessage = {
          type: "danger",
          message:
            "Tivemos um problema ao processar o seu pagamento. Tente novamente mais tarde",
        };

        if (err.message === "Pix not paid yet") {
          alertMessage.message =
            "Não recebemos o seu pix ainda. Vá ao seu banco, efetue o pagamento e volte aqui para confirmar.";
        }

        res.render("checkout/review", {
          reviewView: true,
          item: req.session.item,
          customer: req.session.customer,
          qrCode: req.session.qrCode,
          stepper,
          dynamicURL: process.env.CHECKOUT_DOMAIN,
          alertMessage,
        });
        return;
      }
    }

    if (req.session.paymentMethod === "credit_card") {
      const { cardsRadio } = req.body;

      if (req.session.item.type === "subscription") {
        try {
          const bodySubscriptionOrder = {
            code: req.session.item.id,
            plan_id: req.session.item.id,
            customer_id: req.session.customer.id,
            payment_method: "credit_card",
            card_id: cardsRadio,
            split: {
              enabled: true,
              rules: botConfigs.split_rules,
            },
          };

          const createSubscription = await fetch(
            "https://api.pagar.me/core/v5/subscriptions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: CheckoutController.fetchAuthKey(),
              },
              body: JSON.stringify(bodySubscriptionOrder),
            }
          );
          
          const response = await createSubscription.json();

          if (response.status === 'active') {
            const response = await createSubscription.json();
            const data = {
              customer_chat_id: req.session.customer.code,
              subscription_id: response.id,
              type_item_bought: "subscription",
              bot_name: req.session.botName,
            };
            axios.post(webhookURL, data);
            return res.redirect("success");
          } else {
            console.dir(response, {depth: null});
            throw new Error('Tivemos um problema ao efetuar o pagamento. Tente utilizar outro cartão ou pagar por pix.');
          }
        } catch (err) {
          res.render("checkout/review", {
            reviewView: true,
            item: req.session.item,
            customer: req.session.customer,
            customerCards: req.session.customerCards,
            stepper,
            dynamicURL: process.env.CHECKOUT_DOMAIN,
            alertMessage: {
              type: "danger",
              message:
                "Tivemos um problema ao efetuar o seu pagamento. Tente utilizar outro cartão ou pagar por pix.",
            },
          });
        }
      }

      if (req.session.item.type === "pack") {
        const item = req.session.item;
        let customer = req.session.customer;

        try {
          const bodyPackOrder = {
            code: item.id,
            customer_id: customer.id,
            items: [
              {
                amount: item.amount,
                description: item.name,
                quantity: 1,
                code: item.id,
                category: "pack",
              },
            ],
            payments: [
              {
                payment_method: "credit_card",
                credit_card: {
                  card_id: cardsRadio,
                },
                amount: item.amount,
                split: botConfigs.split_rules,
              },
            ],
            closed: true,
          };

          const buyPack = await fetch("https://api.pagar.me/core/v5/orders", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: CheckoutController.fetchAuthKey(),
            },
            body: JSON.stringify(bodyPackOrder),
          }).catch((err) => {
            return err.json();
          });

          const response = await buyPack.json();

          if (response.status === "paid") {
            const data = {
              customer_chat_id: customer.code,
              pack_id: item.id,
              type_item_bought: "pack",
              bot_name: req.session.botName,
            };
            axios.post(webhookURL, data);
            return res.redirect("success");
          }

          throw new Error(response);
        } catch (err) {
          console.dir(err, {depth: null});
          return res.render("checkout/review", {
            reviewView: true,
            item: req.session.item,
            customer: req.session.customer,
            customerCards: req.session.customerCards,
            stepper,
            dynamicURL: process.env.CHECKOUT_DOMAIN,
            alertMessage: {
              type: "danger",
              message:
                "Tivemos um problema ao efetuar o seu pagamento. Tente utilizar outro cartão ou pagar por pix.",
            },
          });
        }
      }
    }
  }

  static async newCard(req, res) {
    const item = req.session.item;
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
        label: '<i class="bi bi-check-lg"></i>',
      },
      step4: {
        status: "",
        label: "4",
      },
    };
    req.session.customer = { id: req.params.id };
    res.render("checkout/newCard", { item, stepper });
  }

  static async deleteCard(req, res) {
    const { customerId, cardId } = req.params;

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

    try {
      const customerController = new CustomersController(client);
      await customerController.deleteCard(customerId, cardId);

      const { result, ...httpResponse } = await customerController.getCards(
        customerId
      );

      result.data.forEach((card) => {
        card.customerId = customerId;
        return card;
      });

      req.session.customerCards = result.data;
      req.session.save();

      return res.render("checkout/review", {
        reviewView: true,
        item: req.session.item,
        customer: req.session.customer,
        customerCards: result.data,
        stepper,
        dynamicURL: process.env.CHECKOUT_DOMAIN,
        alertMessage: {
          type: "success",
          message: "Você excluiu seu cartão com sucesso!",
        },
      });
    } catch (err) {
      console.log(err);
      let errMessage =
        "Tivemos um problema ao excluir o seu cartão. Tente novamente mais tarde";

      if (
        err.result.message ===
        "This card can not be deleted. Please cancel all active subscriptions on this card to continue."
      )
        errMessage =
          "O cartão não pode ser deletado. Por favor cancele primerio todas as assinaturas que estão ativas nele.";

      return res.render("checkout/review", {
        reviewView: true,
        item: req.session.item,
        customer: req.session.customer,
        customerCards: req.session.customerCards,
        stepper,
        dynamicURL: process.env.CHECKOUT_DOMAIN,
        alertMessage: { type: "danger", message: errMessage },
      });
    }
  }

  static success(req, res) {
    return res.render("checkout/success", { layout: false });
  }
}
