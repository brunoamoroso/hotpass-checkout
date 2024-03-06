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

      if(result.data.length === 0){
        console.log(req.session);
        res.render("checkout/identify", { item, stepper });
        return;
      }

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


    // let customerCards = req.session.customerCards;
    req.session.customerCards.forEach((card) => {
      card.customerId = req.session.customer.id;
      return card;
    });

    if (customerExists) {
      // res.render("checkout/review", {
      //   item,
      //   customer: req.session.customer,
      //   customerCards: req.session.customerCards,
      //   customerExists,
      //   stepper,
      //   dynamicURL: process.env.CHECKOUT_DOMAIN
      // });
      const paymentTypes = [
        {
          icon: '<img src="/imgs/pix_logo.svg" alt="pix icon" height="16" />',
          name: "Pix",
          type: "pix"
        },
        {
          icon: '<i class="bi bi-credit-card-fill"></i>',
          name: "Cartão de Crédito",
          type: "credit_card",
        }
      ];

      return res.render('checkout/choosePayment', {
        item,
        stepper,
        paymentTypes
      })
    }
  }

  static async identifyPost(req, res) {
    console.log(req.session);
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
      number: (number === '') ? 'S/N' : number,
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

        const paymentTypes = [
          {
            icon: '<img src="/imgs/pix_logo.svg" alt="pix icon" height="16" />',
            name: "Pix",
            type: "pix"
          },
          {
            icon: '<i class="bi bi-credit-card-fill"></i>',
            name: "Cartão de Crédito",
            type: "credit_card",
          }
        ];

        return res.render("checkout/choosePayment", { paymentTypes, item: req.session.item, stepper });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        console.log(err);
      }
      throw new Error(err);
    }
  }

  static async choosePaymentPost(req, res){
    console.log(req.session);
    const { paymentMethods } = req.body;
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

    switch (paymentMethods){
      case "pix":
        break;

      case "credit_card":
          if(req.session.customerCards){

          }

          return res.redirect(`newCard/${req.session.customer.id}`);
        break;
    }

    console.log(req.session);
    console.log(req.body);
  }

  //the create empty create new card for a new user
  // static async paymentPost(req, res) {
  //   const stepper = {
  //     step1: {
  //       status: "done",
  //       label: '<i class="bi bi-check-lg"></i>',
  //     },
  //     step2: {
  //       status: "done",
  //       label: '<i class="bi bi-check-lg"></i>',
  //     },
  //     step3: {
  //       status: "done",
  //       label: '<i class="bi bi-check-lg"></i>',
  //     },
  //     step4: {
  //       status: "active",
  //       label: "4",
  //     },
  //   };

  //   if(req.session.customer.document === undefined){
  //     try{
  //       const customerController = new CustomersController(client);
  //       const { result, ...httpResponse } = await customerController.getCustomer(
  //         req.session.customer.id,
  //       );
  
  //       req.session.customer = result;
  //     }catch(err){
  //       throw Error(err);
  //     }
  //   }

  //   const { number, holder_name, due, cvv } = req.body;
  //   const exp_month = parseInt(due.slice(0, 2));
  //   const exp_year = parseInt(due.slice(3, 5));

  //   try {
  //     const bodyCreateCard = {
  //       number: number,
  //       holderName: holder_name,
  //       holderDocument: req.session.customer.document,
  //       expMonth: exp_month,
  //       expYear: exp_year,
  //       cvv: cvv,
  //       billingAddressId: req.session.customer.address.id,
  //     };

  //     const user = process.env.PGMSK;
  //     const password = "";

  //     const customerController = new CustomersController(client);
  //     const {result, ...httpResponse} = await customerController.createCard(req.session.customer.id, bodyCreateCard);
        
  //     let customerCards;
  //     try{
  //       const customerController = new CustomersController(client);
  //       const { result, ...httpResponse } = await customerController.getCards(
  //         req.session.customer.id
  //       );

  //       customerCards = result.data;
  //       customerCards.customerId = req.session.customer.id;
  //     }catch(err){
  //       console.log(err);
  //     }

  //     const customerExists = true;

  //     res.render("checkout/review", {
  //       item: req.session.item,
  //       customer: req.session.customer,
  //       customerCards: customerCards,
  //       customerExists,
  //       stepper,
  //       dynamicURL: process.env.CHECKOUT_DOMAIN
  //     });
  //   } catch (err) {
  //     console.log(err);
  //     res.render('checkout/payment', { item: req.session.item, customer: req.session.customer, stepper, error: "Ocorreu um problema ao tentar criar o seu cartão de crédito. Verifique os dados e tente novamente."});
  //     return;
  //   }
  // }

  static async confirmPayment(req, res) {
    const {cardId} = req.body;
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
          card_id: cardId,
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
        }).then(async (resp) => {
          const response = await resp.json();
          if (resp.status === 200) {
            const webhookURL = process.env.BOTS_DOMAIN + req.session.botName;
            const data = {
              customer_chat_id: req.session.customer.code,
              subscription_id: response.id,
              type_item_bought: "subscription",
              bot_name: req.session.botName,
            };
            axios.post(webhookURL, data);
            res.render("checkout/success", {
              item: req.session.item,
              customer: req.session.customer
            });
          }
          return;
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
                card_id: cardId
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
              pack_id: req.session.item.id,
              type_item_bought: "pack",
              bot_name: req.session.botName,
            };
            axios.post(webhookURL, data);
            res.render("checkout/success", {
              item: req.session.item,
              customer: req.session.customer
            });
          }

          return
        });
      } catch (err) {
        console.log(err);
        res.render("checkout/review", {
          item: req.session.item,
          customer: req.session.customer,
          customerCards: req.session.customerCards,
          customerExists: true,
          stepper,
          dynamicURL: process.env.CHECKOUT_DOMAIN,
          alertMessage: {type: "danger", message: "Tivemos um problema ao efetuar o seu pagamento. Tente novamente mais tarde"}
        });
        return res.status(500).send("Tivemos um problema");
      }
    }
  }

  static async newCard(req, res){
    console.log(req.session);
    const item = req.session.item
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
    req.session.customer = {id: req.params.id}
    res.render('checkout/newCard', {item, stepper});
  }

  static async deleteCard(req, res){
    const {customerId, cardId} = req.params;

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

    try{
      const customerController = new CustomersController(client);
      await customerController.deleteCard(customerId, cardId);

      const {result, ...httpResponse} = await customerController.getCards(customerId);
      
      result.data.customerId = customerId;

      return res.render("checkout/review", {
        item: req.session.item,
        customer: req.session.customer,
        customerCards: result.data,
        customerExists: true,
        stepper,
        dynamicURL: process.env.CHECKOUT_DOMAIN,
        alertMessage: {type: "success", message: "Você excluiu seu cartão com sucesso!"}
      });
      
    }catch(err){
      let errMessage = "Tivemos um problema ao excluir o seu cartão. Tente novamente mais tarde";

      if(err.result.message === 'This card can not be deleted. Please cancel all active subscriptions on this card to continue.') errMessage = "O cartão não pode ser deletado. Por favor cancele primerio todas as assinaturas que estão ativas nele."

      return res.render("checkout/review", {
        item: req.session.item,
        customer: req.session.customer,
        customerCards: req.session.customerCards,
        customerExists: true,
        stepper,
        dynamicURL: process.env.CHECKOUT_DOMAIN,
        alertMessage: {type: "danger", message: errMessage}
      });
    }
  }

  static success (req, res){
    return res.render('checkout/success', {layout: false});
  }
}
