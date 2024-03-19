/**
 * This is a helper to format prices in BRL currency
 * @param {*} price price always should be sent in cents
 * @returns a string with the price formatted
 */
export default function priceFormat(price){
    const formatter = new Intl.NumberFormat("pt-br", {
        style: "currency",
        currency: "BRL",
    });

    return formatter.format(price/100);
}