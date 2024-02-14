import express from 'express';
import CheckoutController from '../controllers/checkoutController.mjs'
import identifyValidateDate from '../middlewares/validators/identifyValidator.mjs';

const router = express.Router();

// router.get("/", CheckoutController.identify);
router.get("/:botName/:id/:itemId", CheckoutController.identify);

router.post('/identify', identifyValidateDate, CheckoutController.identifyPost);
router.post('/address', CheckoutController.addressPost);
router.post('/payment', CheckoutController.paymentPost);
router.post('/confirmPayment', CheckoutController.confirmPayment);
router.get('/newCard/:id', CheckoutController.newCard);

export default router;