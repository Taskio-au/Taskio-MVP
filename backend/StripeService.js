// Inside /backend/StripeService.js

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Creates a new customer in Stripe.
 * @param {object} user - The user object from your database (e.g., from Firestore).
 * @param {string} user.email - The user's email address.
 * @param {string} user.name - The user's full name.
 * @returns {Promise<string>} The Stripe Customer ID (e.g., "cus_...").
 */
const createCustomer = async (user) => {
  try {
    const customer = await stripe.customers.create({
      name: user.name,
      email: user.email,
      // You can add more metadata here to link it back to your internal user ID
      metadata: {
        taskioUid: user.uid, // Assuming your user object has a uid
      },
    });
    console.log(`Stripe customer created: ${customer.id}`);
    return customer.id;
  } catch (error) {
    console.error("Error creating Stripe customer:", error);
    throw new Error("Could not create Stripe customer.");
  }
};

/**
 * Creates a new Payment Intent.
 * @param {number} amount - The amount to charge, in cents (e.g., 10000 for $100.00).
 * @param {string} customerId - The homeowner's Stripe Customer ID.
 * @param {string} tradieStripeAccountId - The tradie's Stripe Connected Account ID.
 * @returns {Promise<object>} The Stripe Payment Intent object.
 */
const createPaymentIntent = async (amount, customerId, tradieStripeAccountId) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'aud',
      customer: customerId,
      // The application_fee_amount is your platform's commission, in cents.
      // This is an example of a 10% fee on a $100 job ($10).
      application_fee_amount: Math.round(amount * 0.10), 
      // 'transfer_data' is the key to your escrow model. It designates the
      // funds for the tradie's connected account.
      transfer_data: {
        destination: tradieStripeAccountId,
      },
    });
    return paymentIntent;
  } catch (error) {
    console.error("Error creating Payment Intent:", error);
    throw new Error("Could not create Payment Intent.");
  }
};

// Update module.exports to include the new function
module.exports = {
  createCustomer,
  createPaymentIntent,
};
