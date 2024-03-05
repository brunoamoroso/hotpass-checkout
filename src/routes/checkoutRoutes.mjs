import express from 'express';
import CheckoutController from '../controllers/checkoutController.mjs'

const router = express.Router();

router.get('/deleteCard/:customerId/:cardId', CheckoutController.deleteCard);
router.get('/newCard/:id', CheckoutController.newCard);
router.get("/:botName/:id/:itemId", CheckoutController.identify);
router.get("/success", CheckoutController.success);

router.post('/identify', CheckoutController.identifyPost);
router.post('/address', CheckoutController.addressPost);
router.post('/payment', CheckoutController.choosePaymentPost);
router.post('/addCard', CheckoutController.paymentPost);
router.post('/confirmPayment', CheckoutController.confirmPayment);

export default router;