// AUTO-GENERATED from the Series 65 question database. Do not edit by hand.
// 400 multiple-choice questions, each assigned to one of four topics by content.

export type Series65Topic =
  | 'Economics'
  | 'Regulations & Ethics'
  | 'Investments'
  | 'Client Management';

export interface Series65Question {
  id: number;
  topic: Series65Topic;
  stem: string;
  options: { label: 'A' | 'B' | 'C' | 'D'; text: string }[];
  answer: 'A' | 'B' | 'C' | 'D';
}

export const SERIES65_QUESTIONS: Series65Question[] = [
  {
    "id": 1,
    "topic": "Economics",
    "stem": "Over time, a country's trade deficit will lead to a decline in the value of its currency because",
    "options": [
      {
        "label": "A",
        "text": "domestic goods will become too expensive for foreigners to buy"
      },
      {
        "label": "B",
        "text": "the country's exports will exceed its imports"
      },
      {
        "label": "C",
        "text": "the money supply will decrease"
      },
      {
        "label": "D",
        "text": "the country's imports will exceed exports creating selling pressure on its currency"
      }
    ],
    "answer": "D"
  },
  {
    "id": 2,
    "topic": "Economics",
    "stem": "A free trade agreement is entered into between Country A and Country B. As time goes on, the value of Country A's currency increases while that of Country B's decreases. The effect of this will likely be that",
    "options": [
      {
        "label": "A",
        "text": "the free trade agreement will be abrogated"
      },
      {
        "label": "B",
        "text": "Country A’s exports to Country B will increase"
      },
      {
        "label": "C",
        "text": "Country A’s imports from Country B will increase"
      },
      {
        "label": "D",
        "text": "Country B’s imports from Country A will increase"
      }
    ],
    "answer": "C"
  },
  {
    "id": 3,
    "topic": "Economics",
    "stem": "If the dollar weakens, which of the following statements is TRUE?",
    "options": [
      {
        "label": "A",
        "text": "The dollar buys more foreign currency."
      },
      {
        "label": "B",
        "text": "Foreign securities denominated in their domestic currency decrease in value to the U.S. investor."
      },
      {
        "label": "C",
        "text": "An increase in U.S. interest rates might strengthen the dollar."
      },
      {
        "label": "D",
        "text": "U.S. exports become less competitive."
      }
    ],
    "answer": "C"
  },
  {
    "id": 4,
    "topic": "Client Management",
    "stem": "All of the following actions will increase the deficit in the U.S. balance of payments EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "U.S. foreign aid"
      },
      {
        "label": "B",
        "text": "investments by U.S. firms abroad"
      },
      {
        "label": "C",
        "text": "Americans buying Japanese cars"
      },
      {
        "label": "D",
        "text": "purchase by foreigners of U.S. securities"
      }
    ],
    "answer": "D"
  },
  {
    "id": 5,
    "topic": "Investments",
    "stem": "A significant increase in the importing of goods into the United States would likely have what effect on the strength of the U.S. dollar?",
    "options": [
      {
        "label": "A",
        "text": "No effect"
      },
      {
        "label": "B",
        "text": "Fluctuation both ways"
      },
      {
        "label": "C",
        "text": "Weaken"
      },
      {
        "label": "D",
        "text": "Strengthen"
      }
    ],
    "answer": "C"
  },
  {
    "id": 6,
    "topic": "Economics",
    "stem": "If a country's current account shows a trade deficit, it is most likely that",
    "options": [
      {
        "label": "A",
        "text": "short-term flows are greater than long-term flows."
      },
      {
        "label": "B",
        "text": "tax payments are greater than tax receipts."
      },
      {
        "label": "C",
        "text": "net exports are greater than zero."
      },
      {
        "label": "D",
        "text": "imports are greater than exports."
      }
    ],
    "answer": "D"
  },
  {
    "id": 7,
    "topic": "Economics",
    "stem": "The primary function of the Federal Reserve System (the Fed) is to",
    "options": [
      {
        "label": "A",
        "text": "carry out monetary policy."
      },
      {
        "label": "B",
        "text": "implement fiscal policy."
      },
      {
        "label": "C",
        "text": "manage the revenues and expenditures of the federal government."
      },
      {
        "label": "D",
        "text": "issue bonds to the general public."
      }
    ],
    "answer": "A"
  },
  {
    "id": 8,
    "topic": "Investments",
    "stem": "A research analyst studying the performance of ABC Industries compares that with reports from other analysts reviewing other companies in other industries. This is known as",
    "options": [
      {
        "label": "A",
        "text": "fundamental analysis"
      },
      {
        "label": "B",
        "text": "bottom-up analysis"
      },
      {
        "label": "C",
        "text": "top-down analysis"
      },
      {
        "label": "D",
        "text": "sector analysis"
      }
    ],
    "answer": "B"
  },
  {
    "id": 9,
    "topic": "Economics",
    "stem": "XYZ Aircraft Manufacturing Corporation, based in the United States, announces a multibillion dollar order for its new jumbo jet from Fly Airlines, a Japanese-based carrier. When the sale is completed, there will be",
    "options": [
      {
        "label": "A",
        "text": "a debit to the current account of the United States"
      },
      {
        "label": "B",
        "text": "no effect on the balance of trade"
      },
      {
        "label": "C",
        "text": "a credit to the current account of the United States"
      },
      {
        "label": "D",
        "text": "a credit to the current account of Japan"
      }
    ],
    "answer": "C"
  },
  {
    "id": 10,
    "topic": "Economics",
    "stem": "When a bank that is a member of the Federal Reserve System borrows from another member bank, the rate that is charged is known as",
    "options": [
      {
        "label": "A",
        "text": "the federal funds rate"
      },
      {
        "label": "B",
        "text": "the call loan rate"
      },
      {
        "label": "C",
        "text": "the discount rate"
      },
      {
        "label": "D",
        "text": "the prime rate"
      }
    ],
    "answer": "A"
  },
  {
    "id": 11,
    "topic": "Client Management",
    "stem": "A securities analyst's approach is to look at the overall economy and try to forecast which industry will outperform. Then, the analyst searches for those individual companies within that industry that appear to have the best expected return and add those to the recommended list. In so doing, this analyst is using",
    "options": [
      {
        "label": "A",
        "text": "the bottom-up approach."
      },
      {
        "label": "B",
        "text": "the optimal portfolio approach"
      },
      {
        "label": "C",
        "text": "the top-down approach."
      },
      {
        "label": "D",
        "text": "the business cycle approach."
      }
    ],
    "answer": "C"
  },
  {
    "id": 12,
    "topic": "Economics",
    "stem": "An expansionary fiscal policy would usually result in",
    "options": [
      {
        "label": "A",
        "text": "a government decreasing government spending to slow down economic activity."
      },
      {
        "label": "B",
        "text": "a government operating a balanced budget."
      },
      {
        "label": "C",
        "text": "a government increasing government spending to stimulate economic activity."
      },
      {
        "label": "D",
        "text": "a government increasing taxes in the economy."
      }
    ],
    "answer": "C"
  },
  {
    "id": 13,
    "topic": "Economics",
    "stem": "A securities analyst's stock selection method is to begin by looking for superior companies, regardless of their industry sector or the condition of the overall economy. In so doing, this analyst is using",
    "options": [
      {
        "label": "A",
        "text": "the business cycle approach."
      },
      {
        "label": "B",
        "text": "the top-down approach."
      },
      {
        "label": "C",
        "text": "the optimal portfolio approach."
      },
      {
        "label": "D",
        "text": "the bottom-up approach."
      }
    ],
    "answer": "D"
  },
  {
    "id": 14,
    "topic": "Client Management",
    "stem": "A securities analyst's approach is to look at the overall economy and try to forecast which industry will outperform. Then, the analyst searches for those individual companies within that industry that appear to have the best expected return and add those to their recommended list. In so doing, this analyst is using the",
    "options": [
      {
        "label": "A",
        "text": "bottom-up approach."
      },
      {
        "label": "B",
        "text": "top-down approach."
      },
      {
        "label": "C",
        "text": "optimal portfolio approach."
      },
      {
        "label": "D",
        "text": "business cycle approach."
      }
    ],
    "answer": "B"
  },
  {
    "id": 15,
    "topic": "Economics",
    "stem": "Among the responsibilities of the Federal Reserve (the Fed) is influencing the supply of money and credit in the economy. When performing this function, adjusting which of the following is not a tool at its disposal?",
    "options": [
      {
        "label": "A",
        "text": "The discount rate"
      },
      {
        "label": "B",
        "text": "The prime rate"
      },
      {
        "label": "C",
        "text": "The activities of the Federal Open Market Committee"
      },
      {
        "label": "D",
        "text": "The reserve requirements"
      }
    ],
    "answer": "B"
  },
  {
    "id": 16,
    "topic": "Economics",
    "stem": "If the dollar weakens, which of the following statements is TRUE?",
    "options": [
      {
        "label": "A",
        "text": "A rise in U.S. interest rates might strengthen the dollar."
      },
      {
        "label": "B",
        "text": "U.S. exports will fall."
      },
      {
        "label": "C",
        "text": "Foreign securities denominated in their domestic currency decrease in value to the U.S. investor."
      },
      {
        "label": "D",
        "text": "The dollar buys more foreign currency."
      }
    ],
    "answer": "A"
  },
  {
    "id": 17,
    "topic": "Investments",
    "stem": "Final approval of the annual operating budget for the United States is given by",
    "options": [
      {
        "label": "A",
        "text": "the president"
      },
      {
        "label": "B",
        "text": "the Conference of Governors"
      },
      {
        "label": "C",
        "text": "the Congress"
      },
      {
        "label": "D",
        "text": "the Cabinet"
      }
    ],
    "answer": "C"
  },
  {
    "id": 18,
    "topic": "Investments",
    "stem": "An analyst uses a stock selection method that involves analyzing a specific corporation, followed by evaluating where it fits in its industry and then viewing the overall economy. The term that best describes this method is",
    "options": [
      {
        "label": "A",
        "text": "efficient frontier"
      },
      {
        "label": "B",
        "text": "bottom-up"
      },
      {
        "label": "C",
        "text": "capital asset pricing model"
      },
      {
        "label": "D",
        "text": "top-down"
      }
    ],
    "answer": "B"
  },
  {
    "id": 19,
    "topic": "Economics",
    "stem": "Country A develops a new product that is in high demand around the world. The likely effect of this would be",
    "options": [
      {
        "label": "A",
        "text": "a trade surplus for Country A"
      },
      {
        "label": "B",
        "text": "a trade deficit for Country A"
      },
      {
        "label": "C",
        "text": "an increase in the income tax rates of Country A"
      },
      {
        "label": "D",
        "text": "a decrease in the value of the currency of Country A"
      }
    ],
    "answer": "A"
  },
  {
    "id": 20,
    "topic": "Economics",
    "stem": "A securities analyst's stock selection method is to begin by looking for superior companies, regardless of their industry sector or the condition of the overall economy. In so doing, this analyst is using the",
    "options": [
      {
        "label": "A",
        "text": "optimal portfolio approach."
      },
      {
        "label": "B",
        "text": "bottom-up approach."
      },
      {
        "label": "C",
        "text": "top-down approach."
      },
      {
        "label": "D",
        "text": "business cycle approach."
      }
    ],
    "answer": "B"
  },
  {
    "id": 21,
    "topic": "Client Management",
    "stem": "Which of the following statements best describes what will happen when the value of the American dollar rises in relationship to foreign currencies?",
    "options": [
      {
        "label": "A",
        "text": "Foreign goods and services will become more expensive for Americans."
      },
      {
        "label": "B",
        "text": "The risk of stagflation will increase."
      },
      {
        "label": "C",
        "text": "Shares of foreign stock will be worth more in terms of American dollars."
      },
      {
        "label": "D",
        "text": "Foreign goods and services will become less expensive for Americans."
      }
    ],
    "answer": "D"
  },
  {
    "id": 22,
    "topic": "Economics",
    "stem": "Overnight loans between banks are made at",
    "options": [
      {
        "label": "A",
        "text": "the discount rate"
      },
      {
        "label": "B",
        "text": "the federal funds rate"
      },
      {
        "label": "C",
        "text": "the prime rate"
      },
      {
        "label": "D",
        "text": "the call loan rate"
      }
    ],
    "answer": "B"
  },
  {
    "id": 23,
    "topic": "Economics",
    "stem": "Which of the following statements describes the federal funds rate?",
    "options": [
      {
        "label": "A",
        "text": "Charge on loans to depositary institutions by the New York FRB"
      },
      {
        "label": "B",
        "text": "Rate charged on reserves traded among commercial banks for overnight use in amounts of $1 million or more"
      },
      {
        "label": "C",
        "text": "Charge on loans to brokers on stock exchange collateral"
      },
      {
        "label": "D",
        "text": "Base rate on corporate loans at large U.S. money center commercial banks"
      }
    ],
    "answer": "B"
  },
  {
    "id": 24,
    "topic": "Economics",
    "stem": "Which of the following statements reflects the monetarist economic position?",
    "options": [
      {
        "label": "A",
        "text": "The amount of money in the economy determines the overall price level over time, therefore the Federal Reserve should control the growth in the amount of money in the economy in a gradual and predictable way."
      },
      {
        "label": "B",
        "text": "The amount of money in the economy is not significant because economic activity reflects the value of real goods and services, therefore the Federal Reserve should not attempt to manage the money supply."
      },
      {
        "label": "C",
        "text": "The total amount of money in the economy is the result of the level of interest rates."
      },
      {
        "label": "D",
        "text": "The best way to control the money supply is to raise taxes which will reduce the amount of money in the economy and lower prices."
      }
    ],
    "answer": "A"
  },
  {
    "id": 25,
    "topic": "Economics",
    "stem": "Which of the following is a component of U.S. fiscal policy?",
    "options": [
      {
        "label": "A",
        "text": "Taxes and budgeting"
      },
      {
        "label": "B",
        "text": "Money supply"
      },
      {
        "label": "C",
        "text": "Reserve requirements"
      },
      {
        "label": "D",
        "text": "Discount rate"
      }
    ],
    "answer": "A"
  },
  {
    "id": 26,
    "topic": "Economics",
    "stem": "Which school of economists encourages a government to spend money to move the economy into an expansionary phase?",
    "options": [
      {
        "label": "A",
        "text": "Supply side"
      },
      {
        "label": "B",
        "text": "Classical"
      },
      {
        "label": "C",
        "text": "Monetarist"
      },
      {
        "label": "D",
        "text": "Keynesian"
      }
    ],
    "answer": "D"
  },
  {
    "id": 27,
    "topic": "Economics",
    "stem": "When analyzing the business cycle, you would expect which phase to occur before reaching the trough?",
    "options": [
      {
        "label": "A",
        "text": "Peak"
      },
      {
        "label": "B",
        "text": "Recovery"
      },
      {
        "label": "C",
        "text": "Expansion"
      },
      {
        "label": "D",
        "text": "Contraction"
      }
    ],
    "answer": "D"
  },
  {
    "id": 28,
    "topic": "Economics",
    "stem": "Which term refers to the taxation, expenditures, and debt management of the federal government?",
    "options": [
      {
        "label": "A",
        "text": "Open market operations"
      },
      {
        "label": "B",
        "text": "Revenue code procedures"
      },
      {
        "label": "C",
        "text": "Monetary policy"
      },
      {
        "label": "D",
        "text": "Fiscal policy"
      }
    ],
    "answer": "D"
  },
  {
    "id": 29,
    "topic": "Economics",
    "stem": "Which of the following is not a characteristic of expansionary monetary policy?",
    "options": [
      {
        "label": "A",
        "text": "The reserve requirement will be increased."
      },
      {
        "label": "B",
        "text": "Interest rates may decline."
      },
      {
        "label": "C",
        "text": "More funds are available for banks to lend to borrowers."
      },
      {
        "label": "D",
        "text": "The money supply will increase."
      }
    ],
    "answer": "A"
  },
  {
    "id": 30,
    "topic": "Economics",
    "stem": "A free trade agreement is entered into between Country A and Country B. As time goes on, the value of Country A's currency decreases while that of Country B increases. The effect of this will likely be that",
    "options": [
      {
        "label": "A",
        "text": "Country A’s imports from Country B will increase"
      },
      {
        "label": "B",
        "text": "Country A’s exports to Country B will decrease"
      },
      {
        "label": "C",
        "text": "Country B’s imports from Country A will increase"
      },
      {
        "label": "D",
        "text": "the free trade agreement will be abrogated"
      }
    ],
    "answer": "D"
  },
  {
    "id": 31,
    "topic": "Economics",
    "stem": "When a bank's reserve account is running low, it might choose to borrow from the Fed. When doing so, the bank will be charged",
    "options": [
      {
        "label": "A",
        "text": "the prime rate"
      },
      {
        "label": "B",
        "text": "the discount rate"
      },
      {
        "label": "C",
        "text": "the federal funds rate"
      },
      {
        "label": "D",
        "text": "the call loan rate"
      }
    ],
    "answer": "B"
  },
  {
    "id": 32,
    "topic": "Economics",
    "stem": "Which of the following statements reflects the monetarist economic position?",
    "options": [
      {
        "label": "A",
        "text": "The best way to control the money supply is to raise taxes, which, in turn, will reduce the amount of money in the economy and lower prices."
      },
      {
        "label": "B",
        "text": "The amount of money in the economy determines the overall price level over time and, therefore, the Federal Reserve should control the growth in the amount of money in the economy in a gradual and predictable way."
      },
      {
        "label": "C",
        "text": "The total amount of money in the economy is the result of the level of interest rates."
      },
      {
        "label": "D",
        "text": "The amount of money in the economy is not significant because economic activity reflects the value of real goods and services and, therefore, the Federal Reserve should not attempt to manage the money supply."
      }
    ],
    "answer": "B"
  },
  {
    "id": 33,
    "topic": "Economics",
    "stem": "The economic theory that says economic growth results from lower tax rates and lower government spending is",
    "options": [
      {
        "label": "A",
        "text": "Keynesian theory"
      },
      {
        "label": "B",
        "text": "monetary theory"
      },
      {
        "label": "C",
        "text": "demand-side theory"
      },
      {
        "label": "D",
        "text": "supply-side theory"
      }
    ],
    "answer": "D"
  },
  {
    "id": 34,
    "topic": "Economics",
    "stem": "If the U.S. dollar has been appreciating against foreign currencies, all of the following statements are true EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "the U.S. dollar buys more of foreign currencies"
      },
      {
        "label": "B",
        "text": "U.S. goods become more expensive in foreign countries"
      },
      {
        "label": "C",
        "text": "foreign goods become cheaper in the United States"
      },
      {
        "label": "D",
        "text": "U.S. exports become more competitive"
      }
    ],
    "answer": "D"
  },
  {
    "id": 35,
    "topic": "Economics",
    "stem": "Which of the following would lead to a debit to our foreign account balance?",
    "options": [
      {
        "label": "A",
        "text": "U.S. residents taking vacations abroad"
      },
      {
        "label": "B",
        "text": "Foreign governments repaying loans to U.S. banks"
      },
      {
        "label": "C",
        "text": "An increase in exports"
      },
      {
        "label": "D",
        "text": "Residents of other countries buying apartments here"
      }
    ],
    "answer": "A"
  },
  {
    "id": 36,
    "topic": "Economics",
    "stem": "Which of the following industries would be least cyclical?",
    "options": [
      {
        "label": "A",
        "text": "Heavy equipment"
      },
      {
        "label": "B",
        "text": "Leisure products"
      },
      {
        "label": "C",
        "text": "Supermarket chain"
      },
      {
        "label": "D",
        "text": "Automobile manufacturing"
      }
    ],
    "answer": "C"
  },
  {
    "id": 37,
    "topic": "Economics",
    "stem": "If an economist were to describe defensive issues, he would probably not include companies that produce",
    "options": [
      {
        "label": "A",
        "text": "clothing"
      },
      {
        "label": "B",
        "text": "tobacco products"
      },
      {
        "label": "C",
        "text": "food products"
      },
      {
        "label": "D",
        "text": "building materials"
      }
    ],
    "answer": "D"
  },
  {
    "id": 38,
    "topic": "Economics",
    "stem": "During the past 2 quarters, the GDP declined by 3%, unemployment rose by 0.7%, and the Consumer Price Index fell off by 1.3%; this economic condition is called",
    "options": [
      {
        "label": "A",
        "text": "inflation"
      },
      {
        "label": "B",
        "text": "depression"
      },
      {
        "label": "C",
        "text": "stagflation"
      },
      {
        "label": "D",
        "text": "recession"
      }
    ],
    "answer": "D"
  },
  {
    "id": 39,
    "topic": "Economics",
    "stem": "Economists have determined that the economy is slowing down. Orders for durable goods have been declining and unemployment, while not a reason for concern, has been steadily increasing over the past year. Given the information provided, what phase of the business cycle is the economy currently experiencing?",
    "options": [
      {
        "label": "A",
        "text": "Deflation"
      },
      {
        "label": "B",
        "text": "Trough"
      },
      {
        "label": "C",
        "text": "Contraction"
      },
      {
        "label": "D",
        "text": "Expansion"
      }
    ],
    "answer": "C"
  },
  {
    "id": 40,
    "topic": "Economics",
    "stem": "Gross Domestic Product (GDP) is increasing. Real interest rates are relatively high. Consumer sentiment is strong, as are auto and retail sales. Labor productivity is declining. What state of the business cycle is the economy likely experiencing?",
    "options": [
      {
        "label": "A",
        "text": "Expansion to peak"
      },
      {
        "label": "B",
        "text": "Trough to recovery"
      },
      {
        "label": "C",
        "text": "Peak to contraction"
      },
      {
        "label": "D",
        "text": "Recovery to expansion"
      }
    ],
    "answer": "A"
  },
  {
    "id": 41,
    "topic": "Economics",
    "stem": "While reviewing nationwide industrial production figures, an analyst notices that inventories have been rising. From that information, one would gather that the economy is most likely in which phase of the business cycle?",
    "options": [
      {
        "label": "A",
        "text": "Recovery"
      },
      {
        "label": "B",
        "text": "Contraction"
      },
      {
        "label": "C",
        "text": "Peak"
      },
      {
        "label": "D",
        "text": "Expansion"
      }
    ],
    "answer": "B"
  },
  {
    "id": 42,
    "topic": "Economics",
    "stem": "Which of the following industries would tend to be the most cyclical?",
    "options": [
      {
        "label": "A",
        "text": "Food producers"
      },
      {
        "label": "B",
        "text": "Tobacco producers"
      },
      {
        "label": "C",
        "text": "Appliance manufacturers"
      },
      {
        "label": "D",
        "text": "Supermarkets"
      }
    ],
    "answer": "C"
  },
  {
    "id": 43,
    "topic": "Economics",
    "stem": "Which of the following is considered the most accurate method of measuring GDP?",
    "options": [
      {
        "label": "A",
        "text": "As a function of GNP"
      },
      {
        "label": "B",
        "text": "Eurodollars"
      },
      {
        "label": "C",
        "text": "Actual dollars"
      },
      {
        "label": "D",
        "text": "Constant dollars"
      }
    ],
    "answer": "D"
  },
  {
    "id": 44,
    "topic": "Economics",
    "stem": "If the Consumer Price Index (CPI) is down but consumer demand is up, the economy is likely in which stage of the business cycle?",
    "options": [
      {
        "label": "A",
        "text": "Contraction to trough"
      },
      {
        "label": "B",
        "text": "Peak to contraction"
      },
      {
        "label": "C",
        "text": "Recovery to expansion"
      },
      {
        "label": "D",
        "text": "Recovery to trough"
      }
    ],
    "answer": "C"
  },
  {
    "id": 45,
    "topic": "Economics",
    "stem": "Which of the following is most likely to be regarded as a defensive stock?",
    "options": [
      {
        "label": "A",
        "text": "A stock selling at an extremely high PE ratio"
      },
      {
        "label": "B",
        "text": "A stock with a strong cash position and little debt"
      },
      {
        "label": "C",
        "text": "A food company stock"
      },
      {
        "label": "D",
        "text": "An aerospace stock"
      }
    ],
    "answer": "C"
  },
  {
    "id": 46,
    "topic": "Economics",
    "stem": "In comparing the change in the GDP from 1 year to another, to arrive at an accurate figure, each year's GDP should be converted to which of the following?",
    "options": [
      {
        "label": "A",
        "text": "Constant dollars"
      },
      {
        "label": "B",
        "text": "International dollars"
      },
      {
        "label": "C",
        "text": "Dollars in terms of gold bullion"
      },
      {
        "label": "D",
        "text": "Dollars valued by exchange with foreign currencies"
      }
    ],
    "answer": "A"
  },
  {
    "id": 47,
    "topic": "Economics",
    "stem": "An investment strategy that is designed to minimize risk and preserve the investor's principal is",
    "options": [
      {
        "label": "A",
        "text": "a growth investment strategy"
      },
      {
        "label": "B",
        "text": "a defensive investment strategy"
      },
      {
        "label": "C",
        "text": "a market capitalization investment strategy"
      },
      {
        "label": "D",
        "text": "an aggressive investment strategy"
      }
    ],
    "answer": "B"
  },
  {
    "id": 48,
    "topic": "Economics",
    "stem": "The contraction phase of the business cycle is least likely accompanied by",
    "options": [
      {
        "label": "A",
        "text": "decreasing inflation pressure."
      },
      {
        "label": "B",
        "text": "decreasing unemployment."
      },
      {
        "label": "C",
        "text": "decreasing business and consumer expenditures."
      },
      {
        "label": "D",
        "text": "low or negative economic growth."
      }
    ],
    "answer": "B"
  },
  {
    "id": 49,
    "topic": "Economics",
    "stem": "Interest rates are rising. An analyst would be most likely to state that the business cycle is in which stage?",
    "options": [
      {
        "label": "A",
        "text": "Contraction"
      },
      {
        "label": "B",
        "text": "Trough"
      },
      {
        "label": "C",
        "text": "Peak"
      },
      {
        "label": "D",
        "text": "Expansion"
      }
    ],
    "answer": "D"
  },
  {
    "id": 50,
    "topic": "Economics",
    "stem": "Interest rates are declining. An analyst would be most likely to state that the business cycle is in which stage?",
    "options": [
      {
        "label": "A",
        "text": "Trough"
      },
      {
        "label": "B",
        "text": "Peak"
      },
      {
        "label": "C",
        "text": "Expansion"
      },
      {
        "label": "D",
        "text": "Contraction"
      }
    ],
    "answer": "D"
  },
  {
    "id": 51,
    "topic": "Economics",
    "stem": "Which of the following would NOT be considered a defensive security?",
    "options": [
      {
        "label": "A",
        "text": "Steel company stock"
      },
      {
        "label": "B",
        "text": "Tobacco stock"
      },
      {
        "label": "C",
        "text": "Food chain stock"
      },
      {
        "label": "D",
        "text": "Utility company stock"
      }
    ],
    "answer": "A"
  },
  {
    "id": 52,
    "topic": "Economics",
    "stem": "To determine the amount of change in the GDP from 1 year to another, both years' GDP should be converted into",
    "options": [
      {
        "label": "A",
        "text": "the exchange value of the dollar, as compared with major foreign currencies"
      },
      {
        "label": "B",
        "text": "the current dollar price of gold bullion"
      },
      {
        "label": "C",
        "text": "international depositary receipts"
      },
      {
        "label": "D",
        "text": "constant dollars"
      }
    ],
    "answer": "D"
  },
  {
    "id": 53,
    "topic": "Economics",
    "stem": "The Conference Board, a nongovernmental nonprofit organization, regularly publishes a list of economic indicators. Which of the following would be included in their list of leading indicators?",
    "options": [
      {
        "label": "A",
        "text": "Manufacturing and trade sales (in constant dollars)"
      },
      {
        "label": "B",
        "text": "Average prime rate"
      },
      {
        "label": "C",
        "text": "Average duration of unemployment"
      },
      {
        "label": "D",
        "text": "Average weekly initial claims for unemployment insurance"
      }
    ],
    "answer": "D"
  },
  {
    "id": 54,
    "topic": "Economics",
    "stem": "An investor purchasing gold bullion is most likely looking for an investment that is",
    "options": [
      {
        "label": "A",
        "text": "countercyclical."
      },
      {
        "label": "B",
        "text": "cyclical."
      },
      {
        "label": "C",
        "text": "income producing."
      },
      {
        "label": "D",
        "text": "exchange traded."
      }
    ],
    "answer": "A"
  },
  {
    "id": 55,
    "topic": "Economics",
    "stem": "The Conference Board releases information about the economy on a monthly basis. Included are a number of different indicators. Economic indicators can be leading, lagging, or coincidental, which indicates the timing of their changes relative to how the economy as a whole changes. Which of the following is a lagging economic indicator?",
    "options": [
      {
        "label": "A",
        "text": "Nonagricultural employment"
      },
      {
        "label": "B",
        "text": "Manufacturers’ new orders for consumer goods"
      },
      {
        "label": "C",
        "text": "Building permits (housing starts)"
      },
      {
        "label": "D",
        "text": "Average prime rate"
      }
    ],
    "answer": "C"
  },
  {
    "id": 56,
    "topic": "Economics",
    "stem": "If the Consumer Price Index (CPI) is up and consumer demand is also up, the economy is likely in which stage of the business cycle?",
    "options": [
      {
        "label": "A",
        "text": "Peak to contraction"
      },
      {
        "label": "B",
        "text": "Contraction to trough"
      },
      {
        "label": "C",
        "text": "Recovery to trough"
      },
      {
        "label": "D",
        "text": "Expansion to peak"
      }
    ],
    "answer": "D"
  },
  {
    "id": 57,
    "topic": "Client Management",
    "stem": "If a customer purchases a food company stock and a utility stock, the customer's portfolio is",
    "options": [
      {
        "label": "A",
        "text": "balanced"
      },
      {
        "label": "B",
        "text": "cyclical"
      },
      {
        "label": "C",
        "text": "diversified"
      },
      {
        "label": "D",
        "text": "defensive"
      }
    ],
    "answer": "D"
  },
  {
    "id": 58,
    "topic": "Economics",
    "stem": "The economy has gone through 3 consecutive quarters of economic decline with no immediate end in sight, and therefore could be said to be",
    "options": [
      {
        "label": "A",
        "text": "in a recovery"
      },
      {
        "label": "B",
        "text": "lagging"
      },
      {
        "label": "C",
        "text": "in a depression"
      },
      {
        "label": "D",
        "text": "in a recession"
      }
    ],
    "answer": "D"
  },
  {
    "id": 59,
    "topic": "Economics",
    "stem": "Which of the following statements about the Consumer Price Index (CPI) is NOT true?",
    "options": [
      {
        "label": "A",
        "text": "The CPI is the most commonly used indicator of the inflation (or deflation) rate in the United States."
      },
      {
        "label": "B",
        "text": "The CPI measures the increase or decrease in the level of consumer prices with respect to the level of wholesale prices on which consumer prices depend."
      },
      {
        "label": "C",
        "text": "The CPI is computed monthly."
      },
      {
        "label": "D",
        "text": "The CPI measures the rate of increase or decrease in a broad range of prices, such as food, housing, medical care, and clothing."
      }
    ],
    "answer": "B"
  },
  {
    "id": 60,
    "topic": "Economics",
    "stem": "An economic condition where the rate of price increases reaches a stable equilibrium and stays there until a shock to the system occurs, at which time, the rate of inflation changes is known as",
    "options": [
      {
        "label": "A",
        "text": "price controls."
      },
      {
        "label": "B",
        "text": "stagnation."
      },
      {
        "label": "C",
        "text": "stagflation."
      },
      {
        "label": "D",
        "text": "inertial inflation."
      }
    ],
    "answer": "D"
  },
  {
    "id": 61,
    "topic": "Economics",
    "stem": "Which of the following best describes the economic phase in which unemployment increases and businesses operate at their lowest capacity levels?",
    "options": [
      {
        "label": "A",
        "text": "Contraction"
      },
      {
        "label": "B",
        "text": "Expansion"
      },
      {
        "label": "C",
        "text": "Trough"
      },
      {
        "label": "D",
        "text": "Peak"
      }
    ],
    "answer": "C"
  },
  {
    "id": 62,
    "topic": "Economics",
    "stem": "Expansions in the business cycle are characterized by",
    "options": [
      {
        "label": "A",
        "text": "higher consumer debt, rising inventories"
      },
      {
        "label": "B",
        "text": "increasing college enrollments and enlistment in military service"
      },
      {
        "label": "C",
        "text": "increasing consumer demand for goods and services, increasing industrial production, and rising stock markets and property values"
      },
      {
        "label": "D",
        "text": "increase in want ads in newspapers, decrease in nonfarm jobs"
      }
    ],
    "answer": "C"
  },
  {
    "id": 63,
    "topic": "Economics",
    "stem": "To reflect a more accurate picture of economic results, gross domestic product is adjusted",
    "options": [
      {
        "label": "A",
        "text": "to include bank reserves"
      },
      {
        "label": "B",
        "text": "for inflation"
      },
      {
        "label": "C",
        "text": "to match foreign GDP"
      },
      {
        "label": "D",
        "text": "downward by the balance of payments"
      }
    ],
    "answer": "B"
  },
  {
    "id": 64,
    "topic": "Economics",
    "stem": "The Conference Board releases information about the economy on a monthly basis. Included are a number of different indicators. Economic indicators can be leading, lagging, or coincidental, which indicates the timing of their changes relative to how the economy as a whole changes. Which of the following is a lagging economic indicator?",
    "options": [
      {
        "label": "A",
        "text": "Nonagricultural employment"
      },
      {
        "label": "B",
        "text": "Prime interest rate"
      },
      {
        "label": "C",
        "text": "Manufacturers' new orders for consumer goods"
      },
      {
        "label": "D",
        "text": "Building permits (housing starts)"
      }
    ],
    "answer": "B"
  },
  {
    "id": 65,
    "topic": "Economics",
    "stem": "A business reporter claims that we are suffering from inertial inflation. This means",
    "options": [
      {
        "label": "A",
        "text": "the economy is about to enter a deflationary period."
      },
      {
        "label": "B",
        "text": "the current rate of inflation will remain at this level until economic shocks cause it to change."
      },
      {
        "label": "C",
        "text": "the business cycle is heading towards a trough."
      },
      {
        "label": "D",
        "text": "prices are increasing at a steady rate."
      }
    ],
    "answer": "B"
  },
  {
    "id": 66,
    "topic": "Investments",
    "stem": "Increases in which of the following indicators are regarded as predictors of the level of business activity?",
    "options": [
      {
        "label": "A",
        "text": "Levels of inventories"
      },
      {
        "label": "B",
        "text": "Corporate profits"
      },
      {
        "label": "C",
        "text": "Personal incomes"
      },
      {
        "label": "D",
        "text": "Building permits"
      }
    ],
    "answer": "D"
  },
  {
    "id": 67,
    "topic": "Economics",
    "stem": "Which of these industries would be considered defensive in the face of a recession?",
    "options": [
      {
        "label": "A",
        "text": "Food producers"
      },
      {
        "label": "B",
        "text": "Automobile manufacturing"
      },
      {
        "label": "C",
        "text": "Trucking"
      },
      {
        "label": "D",
        "text": "Real estate construction"
      }
    ],
    "answer": "A"
  },
  {
    "id": 68,
    "topic": "Economics",
    "stem": "Under the concept of inertial inflation,",
    "options": [
      {
        "label": "A",
        "text": "prices tend to remain the same until the system receives an economic shock."
      },
      {
        "label": "B",
        "text": "inflation and deflation alternate at regular intervals."
      },
      {
        "label": "C",
        "text": "core inflation is a better measure of the actual inflation rate than the CPI."
      },
      {
        "label": "D",
        "text": "prices tend to increase at a steady rate until the system receives an economic shock."
      }
    ],
    "answer": "D"
  },
  {
    "id": 69,
    "topic": "Economics",
    "stem": "Which of the following is a NOT a leading economic indicator?",
    "options": [
      {
        "label": "A",
        "text": "Orders for durable goods"
      },
      {
        "label": "B",
        "text": "New housing permits"
      },
      {
        "label": "C",
        "text": "Duration of unemployment"
      },
      {
        "label": "D",
        "text": "Money supply"
      }
    ],
    "answer": "C"
  },
  {
    "id": 70,
    "topic": "Economics",
    "stem": "The gross domestic product (GDP) for the United States is composed of",
    "options": [
      {
        "label": "A",
        "text": "the national debt"
      },
      {
        "label": "B",
        "text": "the sum of all consumer goods, capital goods, and services produced in the United States and net exports to other countries"
      },
      {
        "label": "C",
        "text": "the sum of all goods and services, imports, and foreign investment"
      },
      {
        "label": "D",
        "text": "the balance of payments"
      }
    ],
    "answer": "B"
  },
  {
    "id": 71,
    "topic": "Economics",
    "stem": "All of the following are leading indicators for economic growth EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "stock prices as measured by the S&P 500 index"
      },
      {
        "label": "B",
        "text": "orders for durable goods"
      },
      {
        "label": "C",
        "text": "average weekly initial claims for state unemployment compensation"
      },
      {
        "label": "D",
        "text": "average prime rate"
      }
    ],
    "answer": "D"
  },
  {
    "id": 72,
    "topic": "Economics",
    "stem": "Which of these is a definition of inflation?",
    "options": [
      {
        "label": "A",
        "text": "An increase in purchasing power"
      },
      {
        "label": "B",
        "text": "An increase in the value of the dollar"
      },
      {
        "label": "C",
        "text": "A decrease in the value of the monetary unit"
      },
      {
        "label": "D",
        "text": "A decrease in consumer demand"
      }
    ],
    "answer": "C"
  },
  {
    "id": 73,
    "topic": "Economics",
    "stem": "The Conference Board releases information about the economy on a monthly basis. Included are a number of different indicators. Economic indicators can be leading, lagging, or coincidental, which indicates the timing of their changes relative to how the economy as a whole changes. Which of the following is a coincident economic indicator?",
    "options": [
      {
        "label": "A",
        "text": "Stock market prices as measured by the S&P 500"
      },
      {
        "label": "B",
        "text": "Industrial production"
      },
      {
        "label": "C",
        "text": "Machine tool orders"
      },
      {
        "label": "D",
        "text": "Agricultural employment"
      }
    ],
    "answer": "B"
  },
  {
    "id": 74,
    "topic": "Economics",
    "stem": "The Conference Board releases information about the economy on a periodic basis. Included are a number of different indicators. These indicators can be used to predict how the economy as a whole might change. Which of the following would be considered a leading indicator?",
    "options": [
      {
        "label": "A",
        "text": "Industrial production"
      },
      {
        "label": "B",
        "text": "CPI for services"
      },
      {
        "label": "C",
        "text": "Stock prices as measured by a broad index such as the S&P 500"
      },
      {
        "label": "D",
        "text": "Gross domestic product"
      }
    ],
    "answer": "C"
  },
  {
    "id": 75,
    "topic": "Investments",
    "stem": "An investor regularly reads financial blogs on the Internet and they are filled with articles suggesting that the economy is headed for a slump. Some are even saying that there will be price deflation. If these projections are accurate, the best place for the investor to place funds would probably be",
    "options": [
      {
        "label": "A",
        "text": "U.S. Treasury bonds"
      },
      {
        "label": "B",
        "text": "common stock"
      },
      {
        "label": "C",
        "text": "commercial real estate"
      },
      {
        "label": "D",
        "text": "gold"
      }
    ],
    "answer": "A"
  },
  {
    "id": 76,
    "topic": "Client Management",
    "stem": "Which of the following statements best describes what will happen when the value of the American dollar rises in relationship to foreign currencies?",
    "options": [
      {
        "label": "A",
        "text": "Foreign goods and services will become more expensive for Americans."
      },
      {
        "label": "B",
        "text": "The risk of stagflation will increase."
      },
      {
        "label": "C",
        "text": "Shares of foreign stock will be worth more in terms of American dollars."
      },
      {
        "label": "D",
        "text": "Foreign goods and services will become less expensive for Americans."
      }
    ],
    "answer": "D"
  },
  {
    "id": 77,
    "topic": "Economics",
    "stem": "Which of the following is a coincident economic indicator?",
    "options": [
      {
        "label": "A",
        "text": "Machine tool orders"
      },
      {
        "label": "B",
        "text": "Agricultural employment"
      },
      {
        "label": "C",
        "text": "Stock market prices as measured by the S&P 500"
      },
      {
        "label": "D",
        "text": "Industrial production"
      }
    ],
    "answer": "D"
  },
  {
    "id": 78,
    "topic": "Investments",
    "stem": "All the pundits are predicting bad times ahead—not only a recession but a period where prices actually fall (deflation). If they are right, the best place for your client would probably be",
    "options": [
      {
        "label": "A",
        "text": "real estate"
      },
      {
        "label": "B",
        "text": "gold"
      },
      {
        "label": "C",
        "text": "common stock"
      },
      {
        "label": "D",
        "text": "U.S. Treasury securities"
      }
    ],
    "answer": "D"
  },
  {
    "id": 79,
    "topic": "Economics",
    "stem": "Which of the following CORRECTLY defines the Consumer Price Index (CPI)?",
    "options": [
      {
        "label": "A",
        "text": "The average cost of goods and services (market basket) in domestic currency, compared to the cost of those same goods and services in another country"
      },
      {
        "label": "B",
        "text": "The average cost of goods and services (market basket) purchased by consumers, compared to those same goods and services purchased during a base period"
      },
      {
        "label": "C",
        "text": "The wholesale cost of goods and services purchased by manufacturers, compared to those same goods and services purchased during a base period"
      },
      {
        "label": "D",
        "text": "The average increase in the general price level over a defined period of time"
      }
    ],
    "answer": "B"
  },
  {
    "id": 80,
    "topic": "Economics",
    "stem": "During an economic downturn, one would expect to see",
    "options": [
      {
        "label": "A",
        "text": "higher unemployment"
      },
      {
        "label": "B",
        "text": "manufacturer’s inventories to decline"
      },
      {
        "label": "C",
        "text": "bond prices fall"
      },
      {
        "label": "D",
        "text": "a rising CPI"
      }
    ],
    "answer": "A"
  },
  {
    "id": 81,
    "topic": "Economics",
    "stem": "Your client calls you after reading a story in the business section of his local newspaper. It seems that the article focused on changes to the core CPI and the client wants to know how that is different from the normal CPI. You should explain that it is",
    "options": [
      {
        "label": "A",
        "text": "the Consumer Price Index excluding energy and food prices"
      },
      {
        "label": "B",
        "text": "the total of the leading indicators, excluding stock prices"
      },
      {
        "label": "C",
        "text": "the figure used to determine annual increases, if any, to Social Security benefits"
      },
      {
        "label": "D",
        "text": "the Consumer Price Index excluding housing and automobiles"
      }
    ],
    "answer": "A"
  },
  {
    "id": 82,
    "topic": "Investments",
    "stem": "Stock market indices have a variety of uses. Which of the following is least accurate regarding the use of stock market indices?",
    "options": [
      {
        "label": "A",
        "text": "They act as the basis of ETFs."
      },
      {
        "label": "B",
        "text": "They help in portfolio performance measurement."
      },
      {
        "label": "C",
        "text": "They act as a market barometer."
      },
      {
        "label": "D",
        "text": "They are a lagging indicator of an economy’s corporate performance."
      }
    ],
    "answer": "B"
  },
  {
    "id": 83,
    "topic": "Economics",
    "stem": "What generally happens to outstanding fixed-income securities when the rate of inflation slows?",
    "options": [
      {
        "label": "A",
        "text": "Short-term securities are affected the most."
      },
      {
        "label": "B",
        "text": "Coupon rates go up."
      },
      {
        "label": "C",
        "text": "Yields go up."
      },
      {
        "label": "D",
        "text": "Prices go up."
      }
    ],
    "answer": "D"
  },
  {
    "id": 84,
    "topic": "Economics",
    "stem": "Which of the following statements about the consumer price index (CPI) is NOT true?",
    "options": [
      {
        "label": "A",
        "text": "The CPI measures the increase or decrease in the level of consumer prices with respect to the level of wholesale prices upon which consumer prices depend."
      },
      {
        "label": "B",
        "text": "The CPI measures the rate of increase or decrease in a broad range of prices, such as food, housing, medical care, and clothing."
      },
      {
        "label": "C",
        "text": "The CPI measures the increase in the general price level of a basket of consumer goods."
      },
      {
        "label": "D",
        "text": "The CPI is computed monthly."
      }
    ],
    "answer": "A"
  },
  {
    "id": 85,
    "topic": "Economics",
    "stem": "Core inflation is best described as an inflation rate",
    "options": [
      {
        "label": "A",
        "text": "the central bank views as acceptable."
      },
      {
        "label": "B",
        "text": "for producers’ raw materials."
      },
      {
        "label": "C",
        "text": "that excludes certain volatile goods prices."
      },
      {
        "label": "D",
        "text": "that includes food and energy prices."
      }
    ],
    "answer": "C"
  },
  {
    "id": 86,
    "topic": "Economics",
    "stem": "An economic indicator that has turning points which tend to occur after the turning points in the business cycle is classified as a",
    "options": [
      {
        "label": "A",
        "text": "trailing indicator."
      },
      {
        "label": "B",
        "text": "lagging indicator."
      },
      {
        "label": "C",
        "text": "coincident indicator."
      },
      {
        "label": "D",
        "text": "leading indicator."
      }
    ],
    "answer": "B"
  },
  {
    "id": 87,
    "topic": "Economics",
    "stem": "A business reporter claims that we are suffering from inertial inflation. This means",
    "options": [
      {
        "label": "A",
        "text": "the business cycle is heading toward a trough."
      },
      {
        "label": "B",
        "text": "the current rate of inflation will remain at this level until economic shocks cause it to change."
      },
      {
        "label": "C",
        "text": "the economy is about to enter a deflationary period."
      },
      {
        "label": "D",
        "text": "prices are increasing at a steady rate."
      }
    ],
    "answer": "B"
  },
  {
    "id": 88,
    "topic": "Economics",
    "stem": "In the secondary market, U.S.Treasury bond prices are most influenced by",
    "options": [
      {
        "label": "A",
        "text": "the Treasury Department"
      },
      {
        "label": "B",
        "text": "the prime rate"
      },
      {
        "label": "C",
        "text": "the primary dealers"
      },
      {
        "label": "D",
        "text": "the inflation rate"
      }
    ],
    "answer": "D"
  },
  {
    "id": 89,
    "topic": "Investments",
    "stem": "Ana is a bond analyst who notices a wider credit spread between Treasury bonds and AAA corporate debt. From this, she would be most likely to infer",
    "options": [
      {
        "label": "A",
        "text": "the economy is weakening."
      },
      {
        "label": "B",
        "text": "interest rates on Treasury bonds are increasing."
      },
      {
        "label": "C",
        "text": "corporate bond prices are increasing."
      },
      {
        "label": "D",
        "text": "corporate earnings are reaching record highs."
      }
    ],
    "answer": "A"
  },
  {
    "id": 90,
    "topic": "Client Management",
    "stem": "As current interest rates go up, the market price of existing corporate bonds bearing lower interest rates will",
    "options": [
      {
        "label": "A",
        "text": "decrease"
      },
      {
        "label": "B",
        "text": "change in unpredictable ways"
      },
      {
        "label": "C",
        "text": "increase"
      },
      {
        "label": "D",
        "text": "stay the same"
      }
    ],
    "answer": "A"
  },
  {
    "id": 91,
    "topic": "Economics",
    "stem": "A bond analyst reports that there is currently an inverted yield curve. That would mean",
    "options": [
      {
        "label": "A",
        "text": "the closer the bond is to its maturity date, the higher the yield."
      },
      {
        "label": "B",
        "text": "the closer the bond is to its maturity date, the lower the yield."
      },
      {
        "label": "C",
        "text": "the further the bond is from its maturity date, the higher the yield."
      },
      {
        "label": "D",
        "text": "bonds with intermediate maturities have the highest yields."
      }
    ],
    "answer": "A"
  },
  {
    "id": 92,
    "topic": "Economics",
    "stem": "Yield curve analysis plays an important role as a benchmarking and forecasting tool for the future direction of interest rates. In most cases, this analysis involves examining",
    "options": [
      {
        "label": "A",
        "text": "bonds of varying quality of similar maturities."
      },
      {
        "label": "B",
        "text": "bonds of a single issuer over varying maturities."
      },
      {
        "label": "C",
        "text": "bonds of similar quality over varying maturities."
      },
      {
        "label": "D",
        "text": "bonds of varying quality over a number of maturities."
      }
    ],
    "answer": "B"
  },
  {
    "id": 93,
    "topic": "Economics",
    "stem": "While listening to a commentator on cable TV, you hear the statement \"the flight to quality has ended.\" What would you expect the effect of this to be?",
    "options": [
      {
        "label": "A",
        "text": "Yield spreads are widening."
      },
      {
        "label": "B",
        "text": "Pessimism is spreading."
      },
      {
        "label": "C",
        "text": "Airline stocks are in for a beating."
      },
      {
        "label": "D",
        "text": "Yield spreads are narrowing."
      }
    ],
    "answer": "D"
  },
  {
    "id": 94,
    "topic": "Economics",
    "stem": "An inverted yield curve results in part by",
    "options": [
      {
        "label": "A",
        "text": "declining interest rates"
      },
      {
        "label": "B",
        "text": "investors buying short-term bonds and selling long-term bonds"
      },
      {
        "label": "C",
        "text": "rising interest rates"
      },
      {
        "label": "D",
        "text": "investors buying long-term bonds and selling short-term bonds"
      }
    ],
    "answer": "D"
  },
  {
    "id": 95,
    "topic": "Investments",
    "stem": "In the investment industry, the term spread has many different meanings. When used in a discussion about bonds, which of the following would be most appropriate?",
    "options": [
      {
        "label": "A",
        "text": "Inverse spread"
      },
      {
        "label": "B",
        "text": "Calendar spread"
      },
      {
        "label": "C",
        "text": "Debit spread"
      },
      {
        "label": "D",
        "text": "Credit spread"
      }
    ],
    "answer": "D"
  },
  {
    "id": 96,
    "topic": "Economics",
    "stem": "A common measurement used to evaluate attitudes regarding future economic conditions is the difference in yields between U.S. Treasury bonds and corporate bonds. This is known as",
    "options": [
      {
        "label": "A",
        "text": "business cycle."
      },
      {
        "label": "B",
        "text": "Consumer Price Index."
      },
      {
        "label": "C",
        "text": "yield spread."
      },
      {
        "label": "D",
        "text": "yield curve."
      }
    ],
    "answer": "C"
  },
  {
    "id": 97,
    "topic": "Economics",
    "stem": "During an economic recession, which of the following items will most likely increase?",
    "options": [
      {
        "label": "A",
        "text": "Bond prices"
      },
      {
        "label": "B",
        "text": "Interest rates"
      },
      {
        "label": "C",
        "text": "Inflation"
      },
      {
        "label": "D",
        "text": "Consumer confidence and profits"
      }
    ],
    "answer": "A"
  },
  {
    "id": 98,
    "topic": "Investments",
    "stem": "Which of the following would probably not be an attractive investment during periods of rising inflation?",
    "options": [
      {
        "label": "A",
        "text": "Gold"
      },
      {
        "label": "B",
        "text": "Oil stocks"
      },
      {
        "label": "C",
        "text": "Real estate"
      },
      {
        "label": "D",
        "text": "Corporate bonds"
      }
    ],
    "answer": "D"
  },
  {
    "id": 99,
    "topic": "Investments",
    "stem": "Which of the following would probably NOT be an attractive investment during periods of rising inflation?",
    "options": [
      {
        "label": "A",
        "text": "Real estate"
      },
      {
        "label": "B",
        "text": "Gold"
      },
      {
        "label": "C",
        "text": "Corporate bonds"
      },
      {
        "label": "D",
        "text": "Oil stocks"
      }
    ],
    "answer": "C"
  },
  {
    "id": 100,
    "topic": "Economics",
    "stem": "A bond analyst is plotting a yield curve and notices that short-term maturities have higher yields than intermediate and long-term maturities. This is an example of",
    "options": [
      {
        "label": "A",
        "text": "a normal yield curve"
      },
      {
        "label": "B",
        "text": "an algorithmic yield curve"
      },
      {
        "label": "C",
        "text": "an inverted yield curve"
      },
      {
        "label": "D",
        "text": "a positive yield curve"
      }
    ],
    "answer": "C"
  },
  {
    "id": 101,
    "topic": "Investments",
    "stem": "Which of the following statements about equity securities is NOT true?",
    "options": [
      {
        "label": "A",
        "text": "Preferred stock pays a fixed dividend."
      },
      {
        "label": "B",
        "text": "Preferred stock is an equity security while common stock is a hybrid."
      },
      {
        "label": "C",
        "text": "Common stock is less sensitive to interest rate risk than preferred stock."
      },
      {
        "label": "D",
        "text": "Preferred stock is usually nonvoting."
      }
    ],
    "answer": "B"
  },
  {
    "id": 102,
    "topic": "Investments",
    "stem": "Which of the following statements concerning equity securities is not correct?",
    "options": [
      {
        "label": "A",
        "text": "Preferred stock is an equity security with an intermediate claim (between the bondholders and the common stockholders) on a firm's assets and earnings."
      },
      {
        "label": "B",
        "text": "Equity securities represent a lending interest in a corporation."
      },
      {
        "label": "C",
        "text": "Common stock is an equity security representing an ownership interest in a corporation."
      },
      {
        "label": "D",
        "text": "Equity securities provide a residual claim, after payment of all obligations to fixed-income claims, on the income and assets of a corporation."
      }
    ],
    "answer": "B"
  },
  {
    "id": 103,
    "topic": "Investments",
    "stem": "The primary defining characteristic of an equity security is",
    "options": [
      {
        "label": "A",
        "text": "it represents ownership in a corporation."
      },
      {
        "label": "B",
        "text": "the ability to keep pace with inflation."
      },
      {
        "label": "C",
        "text": "it pays dividends, usually quarterly."
      },
      {
        "label": "D",
        "text": "voting rights."
      }
    ],
    "answer": "A"
  },
  {
    "id": 104,
    "topic": "Investments",
    "stem": "An investor in an equity security",
    "options": [
      {
        "label": "A",
        "text": "has a say in the day-to-day operations of the business."
      },
      {
        "label": "B",
        "text": "acquires an ownership interest in the companyq"
      },
      {
        "label": "C",
        "text": "is assured of a minimum rate of return."
      },
      {
        "label": "D",
        "text": "becomes a creditor of the company."
      }
    ],
    "answer": "B"
  },
  {
    "id": 105,
    "topic": "Investments",
    "stem": "All of the following represent ownership in corporation except",
    "options": [
      {
        "label": "A",
        "text": "mortgage bonds."
      },
      {
        "label": "B",
        "text": "common stock."
      },
      {
        "label": "C",
        "text": "convertible preferred stock."
      },
      {
        "label": "D",
        "text": "preferred stock."
      }
    ],
    "answer": "A"
  },
  {
    "id": 106,
    "topic": "Client Management",
    "stem": "Which of the following statements regarding international investing is NOT correct?",
    "options": [
      {
        "label": "A",
        "text": "One method to engage in international investing is through American depositary receipts."
      },
      {
        "label": "B",
        "text": "An international investor faces the additional risks of foreign currency risk and country risk."
      },
      {
        "label": "C",
        "text": "International investing offers diversification and potentially higher returns."
      },
      {
        "label": "D",
        "text": "An emerging market is a market in a highly developed foreign economy with stable political and social institutions."
      }
    ],
    "answer": "D"
  },
  {
    "id": 107,
    "topic": "Economics",
    "stem": "An ADR is used to",
    "options": [
      {
        "label": "A",
        "text": "facilitate trading in foreign securities in U.S. markets by U.S. citizens living in the United States"
      },
      {
        "label": "B",
        "text": "reduce currency risk when investing in foreign securities"
      },
      {
        "label": "C",
        "text": "finance foreign trade in which U.S. citizens are engaged"
      },
      {
        "label": "D",
        "text": "facilitate trading in U.S. securities in foreign markets by U.S. citizens living abroad"
      }
    ],
    "answer": "A"
  },
  {
    "id": 108,
    "topic": "Investments",
    "stem": "A client is considering the purchase of American depositary receipts (ADRs). The client is looking to further diversify her portfolio. Which of the following is not a feature of this type of investment vehicle?",
    "options": [
      {
        "label": "A",
        "text": "ADRs are denominated and pay dividends in U.S. dollars."
      },
      {
        "label": "B",
        "text": "They are not subject to exchange rate, or currency, risk."
      },
      {
        "label": "C",
        "text": "ADRs are both liquid and marketable."
      },
      {
        "label": "D",
        "text": "Information regarding the foreign company is more easily attainable than if directly purchased."
      }
    ],
    "answer": "B"
  },
  {
    "id": 109,
    "topic": "Investments",
    "stem": "Which of the following statements concerning international investing is correct?",
    "options": [
      {
        "label": "A",
        "text": "The rates of return on foreign securities are generally less than those available from U.S. markets."
      },
      {
        "label": "B",
        "text": "Information is not as readily available on foreign investments as on domestic ones."
      },
      {
        "label": "C",
        "text": "The addition of foreign securities to a portfolio may result in increased portfolio risk due to the different movements of foreign markets and U.S. markets."
      },
      {
        "label": "D",
        "text": "Foreign markets are usually mature and offer no growth advantages."
      }
    ],
    "answer": "B"
  },
  {
    "id": 110,
    "topic": "Investments",
    "stem": "A technical analyst would be most interested in which of the following?",
    "options": [
      {
        "label": "A",
        "text": "Working capital"
      },
      {
        "label": "B",
        "text": "200-day moving averages"
      },
      {
        "label": "C",
        "text": "Capitalization ratios"
      },
      {
        "label": "D",
        "text": "Price-to-earnings ratios"
      }
    ],
    "answer": "B"
  },
  {
    "id": 111,
    "topic": "Investments",
    "stem": "An investor may expect to receive dividends from",
    "options": [
      {
        "label": "A",
        "text": "a put option"
      },
      {
        "label": "B",
        "text": "an ADR"
      },
      {
        "label": "C",
        "text": "a call option"
      },
      {
        "label": "D",
        "text": "a warrant"
      }
    ],
    "answer": "B"
  },
  {
    "id": 112,
    "topic": "Investments",
    "stem": "A technical analyst would be least concerned with",
    "options": [
      {
        "label": "A",
        "text": "advance\\/decline"
      },
      {
        "label": "B",
        "text": "short interest"
      },
      {
        "label": "C",
        "text": "book value per share"
      },
      {
        "label": "D",
        "text": "S&P 500 index"
      }
    ],
    "answer": "C"
  },
  {
    "id": 113,
    "topic": "Regulations & Ethics",
    "stem": "A risk-averse investor, who had only invested funds in bank certificates of deposits, was informed by his investment adviser representative that higher returns with safety could be achieved by investing in U. S. Treasury notes with a 10-year maturity. The adviser representative assured his client that investment in federal government-backed securities is riskless. In this situation, the representative acted",
    "options": [
      {
        "label": "A",
        "text": "unethically, because the agent failed to disclose that the customer retains interest rate risk"
      },
      {
        "label": "B",
        "text": "unethically, because Treasury notes are unsuitable for a risk-averse customer"
      },
      {
        "label": "C",
        "text": "properly, because Treasury notes carry no risk of principal default"
      },
      {
        "label": "D",
        "text": "properly because Treasury notes are suitable for a risk-averse customer"
      }
    ],
    "answer": "A"
  },
  {
    "id": 114,
    "topic": "Investments",
    "stem": "Which of the following debt instruments does not make periodic interest payments?",
    "options": [
      {
        "label": "A",
        "text": "T-bonds"
      },
      {
        "label": "B",
        "text": "TIPS"
      },
      {
        "label": "C",
        "text": "T-bills"
      },
      {
        "label": "D",
        "text": "T-notes"
      }
    ],
    "answer": "C"
  },
  {
    "id": 115,
    "topic": "Investments",
    "stem": "An investor interested in monthly interest income should invest in",
    "options": [
      {
        "label": "A",
        "text": "utility company stock"
      },
      {
        "label": "B",
        "text": "GNMAs"
      },
      {
        "label": "C",
        "text": "Treasury bonds"
      },
      {
        "label": "D",
        "text": "corporate bonds"
      }
    ],
    "answer": "B"
  },
  {
    "id": 116,
    "topic": "Investments",
    "stem": "An investor purchases a Treasury note and the confirmation shows a price of $102.25. Rounded to the nearest cent, the investor's cost, excluding commissions, is",
    "options": [
      {
        "label": "A",
        "text": "$1,022.50."
      },
      {
        "label": "B",
        "text": "$1,027.81."
      },
      {
        "label": "C",
        "text": "$102.25."
      },
      {
        "label": "D",
        "text": "$1,020.25."
      }
    ],
    "answer": "B"
  },
  {
    "id": 117,
    "topic": "Client Management",
    "stem": "Your client in the 28% federal income tax bracket currently owns some U.S. government bonds with a coupon yield of 6%. In order to receive the same income after taxes, she would need to buy municipal bonds with a coupon of",
    "options": [
      {
        "label": "A",
        "text": "7.68%"
      },
      {
        "label": "B",
        "text": "1.68%"
      },
      {
        "label": "C",
        "text": "4.32%"
      },
      {
        "label": "D",
        "text": "6.00%"
      }
    ],
    "answer": "C"
  },
  {
    "id": 118,
    "topic": "Client Management",
    "stem": "A client is trying to decide between a par value corporate bond carrying a coupon rate of 6.25% per year and a par value municipal bond that pays an annual coupon rate of 4.75%. Assuming all other factors are equal and your client is in a 28% marginal income tax bracket, which bond do you tell the client to purchase and why?",
    "options": [
      {
        "label": "A",
        "text": "The municipal bond because its equivalent taxable yield is 6.3%"
      },
      {
        "label": "B",
        "text": "The municipal bond because its equivalent taxable yield is 6.6%"
      },
      {
        "label": "C",
        "text": "The corporate bond because the after-tax yield is 4.5%"
      },
      {
        "label": "D",
        "text": "The corporate bond because the after-tax yield is 6.25%"
      }
    ],
    "answer": "B"
  },
  {
    "id": 119,
    "topic": "Client Management",
    "stem": "A client is in the 28% marginal federal income tax bracket, and the 3% state income tax bracket. Which of the following investments would produce the highest after-tax yield for the client?",
    "options": [
      {
        "label": "A",
        "text": "A U. S. Treasury note yielding 7%"
      },
      {
        "label": "B",
        "text": "An A-rated corporate mortgage bond yielding 8.0%"
      },
      {
        "label": "C",
        "text": "A triple-A-rated debenture yielding 7.75%"
      },
      {
        "label": "D",
        "text": "A public purpose municipal bond yielding 6%"
      }
    ],
    "answer": "D"
  },
  {
    "id": 120,
    "topic": "Investments",
    "stem": "An analyst uses the dividend growth model to assist in determining appropriate stocks to recommend. This analyst would consider all of the following factors EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "required rate of return"
      },
      {
        "label": "B",
        "text": "growth of the dividend"
      },
      {
        "label": "C",
        "text": "market capitalization"
      },
      {
        "label": "D",
        "text": "current dividend"
      }
    ],
    "answer": "C"
  },
  {
    "id": 121,
    "topic": "Investments",
    "stem": "All of the following statements regarding technical analysis are correct except",
    "options": [
      {
        "label": "A",
        "text": "technical analysts rely heavily on financial ratios in their analysis of stocks."
      },
      {
        "label": "B",
        "text": "technical analysts attempt to predict the future movement of stock prices based on past trends."
      },
      {
        "label": "C",
        "text": "technical analysts use terms such as trendline, support, and resistance in analyzing stocks."
      },
      {
        "label": "D",
        "text": "technical analysts rely on charts to predict the future prices of stocks."
      }
    ],
    "answer": "A"
  },
  {
    "id": 122,
    "topic": "Client Management",
    "stem": "Your client in the 25% federal income tax bracket lives in a state where his earnings place him in the 6% bracket for state income tax purposes. If he were to purchase a 4% bond issued by a political subdivision of another state, his total tax-equivalent yield would be",
    "options": [
      {
        "label": "A",
        "text": "4%"
      },
      {
        "label": "B",
        "text": "slightly more than 5.33%"
      },
      {
        "label": "C",
        "text": "approximately 12.90%"
      },
      {
        "label": "D",
        "text": "slightly less than 5.33%"
      }
    ],
    "answer": "D"
  },
  {
    "id": 123,
    "topic": "Investments",
    "stem": "When an investor divides the coupon rate of a municipal bond by the complement of her tax rate, she is computing the bond's",
    "options": [
      {
        "label": "A",
        "text": "discounted cash flow."
      },
      {
        "label": "B",
        "text": "inflation-adjusted return."
      },
      {
        "label": "C",
        "text": "after-tax rate of return."
      },
      {
        "label": "D",
        "text": "tax-equivalent yield."
      }
    ],
    "answer": "D"
  },
  {
    "id": 124,
    "topic": "Investments",
    "stem": "Sortel Industries has preferred stock outstanding that pays annual dividends of $3.75 a share. If an investor wants to earn a rate of return of 8.5%, how much should she be willing to pay for a share of Sortel preferred stock?",
    "options": [
      {
        "label": "A",
        "text": "$31.88"
      },
      {
        "label": "B",
        "text": "$44.12"
      },
      {
        "label": "C",
        "text": "$42.10"
      },
      {
        "label": "D",
        "text": "$33.89"
      }
    ],
    "answer": "B"
  },
  {
    "id": 125,
    "topic": "Investments",
    "stem": "Securities issued by which of the following agencies offer direct government backing?",
    "options": [
      {
        "label": "A",
        "text": "Federal Home Loan Mortgage Corporation (Freddie Mac)"
      },
      {
        "label": "B",
        "text": "Federal National Mortgage Association"
      },
      {
        "label": "C",
        "text": "Government National Mortgage Association"
      },
      {
        "label": "D",
        "text": "Federal Intermediate Credit Bank"
      }
    ],
    "answer": "C"
  },
  {
    "id": 126,
    "topic": "Investments",
    "stem": "A customer owns cumulative preferred stock (par value of $100) that pays an 8% dividend. The dividend has not been paid this year or for the 2 previous years. How much must the company pay the customer per share before it may pay dividends to the common stockholders?",
    "options": [
      {
        "label": "A",
        "text": "$16.00"
      },
      {
        "label": "B",
        "text": "$8.00"
      },
      {
        "label": "C",
        "text": "$24.00"
      },
      {
        "label": "D",
        "text": "$0.00"
      }
    ],
    "answer": "C"
  },
  {
    "id": 127,
    "topic": "Investments",
    "stem": "A common stockholder's rights include all of the following EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "the receipt of dividends, if declared by the board of directors"
      },
      {
        "label": "B",
        "text": "electing the board of directors"
      },
      {
        "label": "C",
        "text": "the right to determine the par value of the stock"
      },
      {
        "label": "D",
        "text": "preemptive rights"
      }
    ],
    "answer": "C"
  },
  {
    "id": 128,
    "topic": "Investments",
    "stem": "Reasons why a corporation might issue a convertible preferred stock would include",
    "options": [
      {
        "label": "A",
        "text": "giving those shareholders an opportunity to participate in the future success of the company"
      },
      {
        "label": "B",
        "text": "giving those shareholders the ability to convert into the issuer's bonds"
      },
      {
        "label": "C",
        "text": "a lower cost to the issuer than would be incurred by the issuance of convertible bonds"
      },
      {
        "label": "D",
        "text": "tax savings to the issuer"
      }
    ],
    "answer": "A"
  },
  {
    "id": 129,
    "topic": "Investments",
    "stem": "A company's dividend on its common stock is",
    "options": [
      {
        "label": "A",
        "text": "determined by its board of directors"
      },
      {
        "label": "B",
        "text": "voted on by shareholders"
      },
      {
        "label": "C",
        "text": "specified in the company charter"
      },
      {
        "label": "D",
        "text": "mandatory if the company is profitable"
      }
    ],
    "answer": "A"
  },
  {
    "id": 130,
    "topic": "Client Management",
    "stem": "Corporations have found that one way to increase employee motivation is to grant options to purchase stock in the company. Incentive (qualified) options differ from nonqualified options in all of the following respects except",
    "options": [
      {
        "label": "A",
        "text": "there is a maximum 10-year limit for exercising an ISO; no such time limit exists for an NSO."
      },
      {
        "label": "B",
        "text": "the holder of an ISO can recognize capital gain (loss) as a result of exercise, whereas ordinary income (loss) is the result with an NSO."
      },
      {
        "label": "C",
        "text": "ISOs may only be granted to employees while NSOs may be given to virtually anyone."
      },
      {
        "label": "D",
        "text": "the recipient of the grant of the ISO has no income tax consequences at the time of the grant."
      }
    ],
    "answer": "D"
  },
  {
    "id": 131,
    "topic": "Investments",
    "stem": "Which of the following has the least exposure to inflation risk?",
    "options": [
      {
        "label": "A",
        "text": "Cash"
      },
      {
        "label": "B",
        "text": "Common stock."
      },
      {
        "label": "C",
        "text": "Fixed annuity"
      },
      {
        "label": "D",
        "text": "Preferred stock"
      }
    ],
    "answer": "B"
  },
  {
    "id": 132,
    "topic": "Investments",
    "stem": "ABC Corporation has a 10% noncumulative preferred stock outstanding at $100 par value. Two years ago, ABC omitted its preferred dividend, and last year, it paid a dividend of $5 per share. To pay a dividend to common shareholders this year, each preferred share must be paid a dividend of",
    "options": [
      {
        "label": "A",
        "text": "$15.00"
      },
      {
        "label": "B",
        "text": "$10.00"
      },
      {
        "label": "C",
        "text": "$5.00"
      },
      {
        "label": "D",
        "text": "$25.00"
      }
    ],
    "answer": "B"
  },
  {
    "id": 133,
    "topic": "Investments",
    "stem": "Investments in which of the following offer the best long-term protection against inflation?",
    "options": [
      {
        "label": "A",
        "text": "Government bonds"
      },
      {
        "label": "B",
        "text": "Fixed annuities"
      },
      {
        "label": "C",
        "text": "Corporate bonds"
      },
      {
        "label": "D",
        "text": "Common stock"
      }
    ],
    "answer": "D"
  },
  {
    "id": 134,
    "topic": "Investments",
    "stem": "One of the rights of those owning common stock is the opportunity to vote on issues brought up at the corporation's annual meeting. To be eligible to cast a vote,",
    "options": [
      {
        "label": "A",
        "text": "the stockholder must be a natural person"
      },
      {
        "label": "B",
        "text": "the company must be current on its dividends to preferred stockholders"
      },
      {
        "label": "C",
        "text": "the stock must be paid for in full before the annual meeting"
      },
      {
        "label": "D",
        "text": "ownership must be established by the record date"
      }
    ],
    "answer": "D"
  },
  {
    "id": 135,
    "topic": "Investments",
    "stem": "An employee wishing to obtain long-term capital gain treatment would prefer the employer to offer",
    "options": [
      {
        "label": "A",
        "text": "listed stock options"
      },
      {
        "label": "B",
        "text": "non-qualified stock options"
      },
      {
        "label": "C",
        "text": "incentive stock options"
      },
      {
        "label": "D",
        "text": "portable stock options"
      }
    ],
    "answer": "C"
  },
  {
    "id": 136,
    "topic": "Investments",
    "stem": "Which of the following statements about dividends on common stock is NOT true?",
    "options": [
      {
        "label": "A",
        "text": "Only those who are owners of the stock on the record date will receive dividends"
      },
      {
        "label": "B",
        "text": "Corporations are contractually obligated to pay dividends to their shareholders each year"
      },
      {
        "label": "C",
        "text": "Dividends represent a pro rata distribution of corporate profits to shareholders"
      },
      {
        "label": "D",
        "text": "Dividends may be paid in cash, property, or stock"
      }
    ],
    "answer": "B"
  },
  {
    "id": 137,
    "topic": "Client Management",
    "stem": "A client has 100 shares of GHI when the stock undergoes a split. After the split, the client has",
    "options": [
      {
        "label": "A",
        "text": "a proportionately decreased interest in the company"
      },
      {
        "label": "B",
        "text": "greater exposure"
      },
      {
        "label": "C",
        "text": "no effective change in the value of the position"
      },
      {
        "label": "D",
        "text": "a proportionately increased interest in the company"
      }
    ],
    "answer": "C"
  },
  {
    "id": 138,
    "topic": "Investments",
    "stem": "One of the features of convertible preferred stock is that",
    "options": [
      {
        "label": "A",
        "text": "the owner has the opportunity to convert the stock into the issuer’s bonds"
      },
      {
        "label": "B",
        "text": "the holder is able to select the conversion price"
      },
      {
        "label": "C",
        "text": "the dividend is paid ahead of all other securities"
      },
      {
        "label": "D",
        "text": "the owner has the opportunity to participate in the growth of the company"
      }
    ],
    "answer": "D"
  },
  {
    "id": 139,
    "topic": "Investments",
    "stem": "Which of the following statements best describes cumulative preferred stock?",
    "options": [
      {
        "label": "A",
        "text": "Owners have a continuing claim to their dividends, and all arrears must be paid before any dividends can be paid on common stock."
      },
      {
        "label": "B",
        "text": "Owners lose any claim to dividends that are not paid in any one year."
      },
      {
        "label": "C",
        "text": "Owners are allowed to vote for directors using the cumulative voting procedures."
      },
      {
        "label": "D",
        "text": "Owners receive an extra dividend, along with common shareholders, in addition to the preferred dividend."
      }
    ],
    "answer": "A"
  },
  {
    "id": 140,
    "topic": "Investments",
    "stem": "Which of the following statements regarding preemptive rights is TRUE?",
    "options": [
      {
        "label": "A",
        "text": "Both common and preferred stockholders have the right to subscribe to a rights offering."
      },
      {
        "label": "B",
        "text": "Common stockholders do not have the right to subscribe to a rights offering."
      },
      {
        "label": "C",
        "text": "Preferred stockholders do not have the right to subscribe to a rights offering."
      },
      {
        "label": "D",
        "text": "Neither common nor preferred stockholders have the right to subscribe to a rights offering."
      }
    ],
    "answer": "C"
  },
  {
    "id": 141,
    "topic": "Client Management",
    "stem": "If a customer owns 7% of a publicly-traded company's stock and his spouse owns 6% and wants to sell her shares, which of the following statements is true?",
    "options": [
      {
        "label": "A",
        "text": "The spouse is not an affiliate and Rule 144 does not apply."
      },
      {
        "label": "B",
        "text": "The spouse is an affiliate and Rule 144 does not apply."
      },
      {
        "label": "C",
        "text": "The spouse is not an affiliate and Rule 144 applies."
      },
      {
        "label": "D",
        "text": "The spouse is an affiliate and Rule 144 applies."
      }
    ],
    "answer": "D"
  },
  {
    "id": 142,
    "topic": "Investments",
    "stem": "One way in which incentive stock options (ISOs) differ from nonqualified stock options (NQSOs) is that",
    "options": [
      {
        "label": "A",
        "text": "the bargain element of the ISO is an AMT preference item."
      },
      {
        "label": "B",
        "text": "the bargain element of the ISO is reported as wages on the tax returns of the employer and the employee."
      },
      {
        "label": "C",
        "text": "there is a maximum 5-year limit for exercise on the ISO while the time limit on the NQSO is 10 years."
      },
      {
        "label": "D",
        "text": "gains on an ISO are always short-term while those on an NQSO are long-term."
      }
    ],
    "answer": "A"
  },
  {
    "id": 143,
    "topic": "Investments",
    "stem": "A corporation would like to offer their employees an opportunity to participate in the future growth of the company. Among the methods you might suggest are",
    "options": [
      {
        "label": "A",
        "text": "voting-trust certificates"
      },
      {
        "label": "B",
        "text": "employee stock options"
      },
      {
        "label": "C",
        "text": "subordinated debentures"
      },
      {
        "label": "D",
        "text": "preemptive rights"
      }
    ],
    "answer": "B"
  },
  {
    "id": 144,
    "topic": "Investments",
    "stem": "An investor holding which of the following equity securities would NOT expect to have preemptive rights?",
    "options": [
      {
        "label": "A",
        "text": "Preferred stock"
      },
      {
        "label": "B",
        "text": "Common stock acquired in a private placement"
      },
      {
        "label": "C",
        "text": "Control stock"
      },
      {
        "label": "D",
        "text": "Common stock"
      }
    ],
    "answer": "A"
  },
  {
    "id": 145,
    "topic": "Investments",
    "stem": "Which of the following is not a characteristic of American depositary receipts (ADRs)?",
    "options": [
      {
        "label": "A",
        "text": "Because ADRs are traded on the exchanges, they are relatively liquid and marketable investments."
      },
      {
        "label": "B",
        "text": "ADR holders may surrender ADRs in exchange for receiving the shares of the non-U.S. company."
      },
      {
        "label": "C",
        "text": "Dividends are declared in the foreign currency, so exchange rate, or currency, risk is completely eliminated."
      },
      {
        "label": "D",
        "text": "ADRs are denominated and pay dividends in U.S. dollars, not foreign currencies, thus saving the investor transaction costs with respect to converting currencies."
      }
    ],
    "answer": "C"
  },
  {
    "id": 146,
    "topic": "Investments",
    "stem": "One of the rights of being a stockholder is the ability to vote on important corporate matters, such as the election of members to the board of directors. The date that determines which shareholders are eligible to votes is",
    "options": [
      {
        "label": "A",
        "text": "the ex-dividend date."
      },
      {
        "label": "B",
        "text": "the last day of the company’s fiscal year."
      },
      {
        "label": "C",
        "text": "the record date."
      },
      {
        "label": "D",
        "text": "the election date."
      }
    ],
    "answer": "C"
  },
  {
    "id": 147,
    "topic": "Investments",
    "stem": "A client is considering the purchase of American depositary receipts (ADRs). She is looking to further diversify her portfolio. Which of the following is not a feature of this type of investment vehicle?",
    "options": [
      {
        "label": "A",
        "text": "ADRs are traded on exchanges and the OTC markets."
      },
      {
        "label": "B",
        "text": "They are not subject to exchange rate, or currency, risk."
      },
      {
        "label": "C",
        "text": "ADRs are denominated in and pay dividends in U.S. dollars."
      },
      {
        "label": "D",
        "text": "Information regarding the foreign company is easily attainable."
      }
    ],
    "answer": "B"
  },
  {
    "id": 148,
    "topic": "Client Management",
    "stem": "Which of the following statements regarding international investing is not correct?",
    "options": [
      {
        "label": "A",
        "text": "An international investor faces the additional risks of foreign currency risk and country risk."
      },
      {
        "label": "B",
        "text": "An emerging market is a market in a highly-developed foreign economy with stable political and social institutions."
      },
      {
        "label": "C",
        "text": "One method to engage in international investing is through American depositary receipts."
      },
      {
        "label": "D",
        "text": "International investing offers diversification and potentially higher returns."
      }
    ],
    "answer": "B"
  },
  {
    "id": 149,
    "topic": "Investments",
    "stem": "An employee is offered a nonqualified stock option with an exercise price of $20 per share. If the option is exercised when the current market value of the stock is $30, the employee",
    "options": [
      {
        "label": "A",
        "text": "has a capital gain of $10 per share"
      },
      {
        "label": "B",
        "text": "is taxed on $30 per share as if it were salary"
      },
      {
        "label": "C",
        "text": "is taxed on $20 per share as if it were salary"
      },
      {
        "label": "D",
        "text": "is taxed on $10 per share as if it were salary"
      }
    ],
    "answer": "D"
  },
  {
    "id": 150,
    "topic": "Investments",
    "stem": "A client is considering the purchase of American depositary receipts (ADRs). She is looking to further diversify her portfolio. Which of the following is NOT a feature of this type of investment vehicle?",
    "options": [
      {
        "label": "A",
        "text": "ADRs are traded on exchanges and the OTC markets."
      },
      {
        "label": "B",
        "text": "Information regarding the foreign company is easily attainable."
      },
      {
        "label": "C",
        "text": "They are not subject to exchange rate, or currency, risk."
      },
      {
        "label": "D",
        "text": "ADRs are denominated in and pay dividends in U.S. dollars."
      }
    ],
    "answer": "C"
  },
  {
    "id": 151,
    "topic": "Investments",
    "stem": "A company that has issued cumulative preferred stock",
    "options": [
      {
        "label": "A",
        "text": "pays the preferred dividend before paying the coupons due on its outstanding bonds"
      },
      {
        "label": "B",
        "text": "forces conversion of the preferred that is trading at a discount to par, thereby eliminating the need to pay past-due dividends"
      },
      {
        "label": "C",
        "text": "pays past and current preferred dividends before paying dividends on common stock"
      },
      {
        "label": "D",
        "text": "pays the current dividends on the preferred, but not the past dividends on the preferred, before paying a dividend on the common"
      }
    ],
    "answer": "C"
  },
  {
    "id": 152,
    "topic": "Investments",
    "stem": "ADRs are used to facilitate",
    "options": [
      {
        "label": "A",
        "text": "the domestic trading of foreign securities"
      },
      {
        "label": "B",
        "text": "the domestic trading of U.S. government securities"
      },
      {
        "label": "C",
        "text": "the foreign trading of domestic securities"
      },
      {
        "label": "D",
        "text": "the foreign trading of U.S. government securities"
      }
    ],
    "answer": "A"
  },
  {
    "id": 153,
    "topic": "Investments",
    "stem": "Which of the following is a risk faced by investors in foreign stocks that is not found when investing in domestic issues?",
    "options": [
      {
        "label": "A",
        "text": "Credit risk"
      },
      {
        "label": "B",
        "text": "Exchange rate risk"
      },
      {
        "label": "C",
        "text": "Market risk"
      },
      {
        "label": "D",
        "text": "Business risk"
      }
    ],
    "answer": "B"
  },
  {
    "id": 154,
    "topic": "Investments",
    "stem": "An American depositary receipt (ADR) is",
    "options": [
      {
        "label": "A",
        "text": "a certificate representing ownership of a foreign security that is on deposit at a U.S. bank"
      },
      {
        "label": "B",
        "text": "a certificate representing ownership of a U.S. security that is deposited in a foreign bank"
      },
      {
        "label": "C",
        "text": "a type of derivative used to speculate in foreign currencies"
      },
      {
        "label": "D",
        "text": "a document used with interest rate swaps"
      }
    ],
    "answer": "A"
  },
  {
    "id": 155,
    "topic": "Investments",
    "stem": "A fundamental analyst would be most interested in which of the following?",
    "options": [
      {
        "label": "A",
        "text": "Resistance and support levels"
      },
      {
        "label": "B",
        "text": "A P\\/E analysis of the stocks included in the Dow Jones Industrial Average"
      },
      {
        "label": "C",
        "text": "A 200-day moving average"
      },
      {
        "label": "D",
        "text": "The outstanding short interest in the market"
      }
    ],
    "answer": "B"
  },
  {
    "id": 156,
    "topic": "Investments",
    "stem": "An analytical tool used to project the current value of a common stock using projected future dividends is",
    "options": [
      {
        "label": "A",
        "text": "the price-to-earnings ratio"
      },
      {
        "label": "B",
        "text": "the dividend payout ratio"
      },
      {
        "label": "C",
        "text": "the dividend discount model"
      },
      {
        "label": "D",
        "text": "the future value computation"
      }
    ],
    "answer": "C"
  },
  {
    "id": 157,
    "topic": "Investments",
    "stem": "Which of the following is used in technical analysis in an attempt to modify fluctuations of stock prices over the long term into a smoothed trend?",
    "options": [
      {
        "label": "A",
        "text": "Consolidation"
      },
      {
        "label": "B",
        "text": "Trend lines"
      },
      {
        "label": "C",
        "text": "Support and resistance"
      },
      {
        "label": "D",
        "text": "Moving averages"
      }
    ],
    "answer": "D"
  },
  {
    "id": 158,
    "topic": "Investments",
    "stem": "When reviewing potential securities to select for an investor's portfolio, a technical analyst would be most likely to evaluate",
    "options": [
      {
        "label": "A",
        "text": "the price-to-book ratio"
      },
      {
        "label": "B",
        "text": "the price-to-earnings ratio"
      },
      {
        "label": "C",
        "text": "the management tenure"
      },
      {
        "label": "D",
        "text": "the daily trading volume"
      }
    ],
    "answer": "D"
  },
  {
    "id": 159,
    "topic": "Investments",
    "stem": "All the following factors support fundamental analysis while assessing a wide range of qualitative factors except",
    "options": [
      {
        "label": "A",
        "text": "the company’s competitive position."
      },
      {
        "label": "B",
        "text": "the company’s stock price trend."
      },
      {
        "label": "C",
        "text": "the company’s management team’s quality and experience."
      },
      {
        "label": "D",
        "text": "the company’s business model."
      }
    ],
    "answer": "B"
  },
  {
    "id": 160,
    "topic": "Investments",
    "stem": "Which of the following might be used by an analyst to approximate a reasonable price for a common stock?",
    "options": [
      {
        "label": "A",
        "text": "Yield to maturity"
      },
      {
        "label": "B",
        "text": "The dividend discount model"
      },
      {
        "label": "C",
        "text": "Par value"
      },
      {
        "label": "D",
        "text": "Book value per share"
      }
    ],
    "answer": "B"
  },
  {
    "id": 161,
    "topic": "Investments",
    "stem": "Which of the following statements is TRUE?",
    "options": [
      {
        "label": "A",
        "text": "A stock split increases the owner’s proportionate share of the company."
      },
      {
        "label": "B",
        "text": "A growth company would be more likely to pay a cash dividend than a stock dividend."
      },
      {
        "label": "C",
        "text": "Dividends have a significant influence on the value of the corporation's stock."
      },
      {
        "label": "D",
        "text": "A corporation is required to pay a cash dividend to stockholders if the earnings are sufficient, especially if it is of preferred stock."
      }
    ],
    "answer": "C"
  },
  {
    "id": 162,
    "topic": "Investments",
    "stem": "During the analysis of XYZ stock, a technical analyst concludes that XYZ's support level has been broken. Being a technician, the most appropriate decision should be to",
    "options": [
      {
        "label": "A",
        "text": "rate the stock as a hold."
      },
      {
        "label": "B",
        "text": "rate the stock as a sell."
      },
      {
        "label": "C",
        "text": "rate the stock as a buy."
      },
      {
        "label": "D",
        "text": "purchase additional shares of the stock."
      }
    ],
    "answer": "B"
  },
  {
    "id": 163,
    "topic": "Investments",
    "stem": "To a technical analyst, the resistance level signifies the price at which a stock's supply would be expected to",
    "options": [
      {
        "label": "A",
        "text": "increase substantially."
      },
      {
        "label": "B",
        "text": "decrease substantially."
      },
      {
        "label": "C",
        "text": "cause the stock price to \"\"break out\"\"."
      },
      {
        "label": "D",
        "text": "remain constant."
      }
    ],
    "answer": "A"
  },
  {
    "id": 164,
    "topic": "Investments",
    "stem": "If a technician believed in the importance of volume, which of the following would indicate bullish sentiment?",
    "options": [
      {
        "label": "A",
        "text": "Prices increase on heavy volume."
      },
      {
        "label": "B",
        "text": "Prices decrease on heavy volume."
      },
      {
        "label": "C",
        "text": "Prices decrease on light volume."
      },
      {
        "label": "D",
        "text": "Prices increase on light volume."
      }
    ],
    "answer": "A"
  },
  {
    "id": 165,
    "topic": "Investments",
    "stem": "A technical analyst (chartist) with a long position in a particular stock would most likely enter a sell stop order below that stock's",
    "options": [
      {
        "label": "A",
        "text": "resistance level"
      },
      {
        "label": "B",
        "text": "previous high"
      },
      {
        "label": "C",
        "text": "support level"
      },
      {
        "label": "D",
        "text": "200-day moving average"
      }
    ],
    "answer": "C"
  },
  {
    "id": 166,
    "topic": "Investments",
    "stem": "Which of the following would NOT be of interest to a technical analyst?",
    "options": [
      {
        "label": "A",
        "text": "Moving averages"
      },
      {
        "label": "B",
        "text": "Volume"
      },
      {
        "label": "C",
        "text": "P\\/E ratio"
      },
      {
        "label": "D",
        "text": "Advance\\/decline line"
      }
    ],
    "answer": "C"
  },
  {
    "id": 167,
    "topic": "Investments",
    "stem": "A fundamental analyst researching a stock is concerned with all of the following EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "management efficiency"
      },
      {
        "label": "B",
        "text": "capitalization ratio"
      },
      {
        "label": "C",
        "text": "the stock's market price as a multiple of the company's earnings"
      },
      {
        "label": "D",
        "text": "volume of shares traded"
      }
    ],
    "answer": "D"
  },
  {
    "id": 168,
    "topic": "Investments",
    "stem": "In the technical analysis of the value of securities, which of the following items is NOT important?",
    "options": [
      {
        "label": "A",
        "text": "A prevailing market trend in response to shifts in supply and demand"
      },
      {
        "label": "B",
        "text": "The amount of a company's past earnings"
      },
      {
        "label": "C",
        "text": "Resistance and support levels"
      },
      {
        "label": "D",
        "text": "The breadth of market volume"
      }
    ],
    "answer": "B"
  },
  {
    "id": 169,
    "topic": "Investments",
    "stem": "The type of analysis that attempts to value securities by examining general economic trends and the growth potential and productivity of individual companies is",
    "options": [
      {
        "label": "A",
        "text": "holding period analysis"
      },
      {
        "label": "B",
        "text": "credit analysis"
      },
      {
        "label": "C",
        "text": "fundamental analysis"
      },
      {
        "label": "D",
        "text": "technical analysis"
      }
    ],
    "answer": "C"
  },
  {
    "id": 170,
    "topic": "Investments",
    "stem": "A fundamental analyst would be interested in all of the following EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "statistics of the U.S. Department of Commerce on disposable income"
      },
      {
        "label": "B",
        "text": "innovations within the automotive industry"
      },
      {
        "label": "C",
        "text": "corporate annual reports"
      },
      {
        "label": "D",
        "text": "daily trading volumes on the NYSE"
      }
    ],
    "answer": "D"
  },
  {
    "id": 171,
    "topic": "Investments",
    "stem": "A technical analyst is least likely to consider which of the following when selecting securities?",
    "options": [
      {
        "label": "A",
        "text": "Short interest ratio"
      },
      {
        "label": "B",
        "text": "Trend lines"
      },
      {
        "label": "C",
        "text": "Advance\\/decline line"
      },
      {
        "label": "D",
        "text": "Corporate earnings"
      }
    ],
    "answer": "D"
  },
  {
    "id": 172,
    "topic": "Investments",
    "stem": "A stock has been in a downtrend for several days. When its price decreases to near $30, many investors enter orders to buy the stock and the price increases to $31. This is most likely an example of",
    "options": [
      {
        "label": "A",
        "text": "a change in polarity."
      },
      {
        "label": "B",
        "text": "a resistance level."
      },
      {
        "label": "C",
        "text": "a support level."
      },
      {
        "label": "D",
        "text": "a reversal."
      }
    ],
    "answer": "C"
  },
  {
    "id": 173,
    "topic": "Investments",
    "stem": "Which of the following is not included in fundamental analysis of a company?",
    "options": [
      {
        "label": "A",
        "text": "The study of the direction of the economy."
      },
      {
        "label": "B",
        "text": "The study of a firm's financial statements."
      },
      {
        "label": "C",
        "text": "The study of a company’s historical stock prices and trading volume."
      },
      {
        "label": "D",
        "text": "The study of a firm's position within its industry."
      }
    ],
    "answer": "C"
  },
  {
    "id": 174,
    "topic": "Investments",
    "stem": "Which of the following would be of least interest to a chartist?",
    "options": [
      {
        "label": "A",
        "text": "The volume of shares traded during the past month"
      },
      {
        "label": "B",
        "text": "The advance\\/decline line"
      },
      {
        "label": "C",
        "text": "The short interest"
      },
      {
        "label": "D",
        "text": "The relationship between the current market price of an issuer's common stock and most recently reported earnings per share"
      }
    ],
    "answer": "D"
  },
  {
    "id": 175,
    "topic": "Investments",
    "stem": "A support level is the price range at which a technical analyst would expect",
    "options": [
      {
        "label": "A",
        "text": "the supply of a stock to decrease substantially."
      },
      {
        "label": "B",
        "text": "the demand for a stock to increase substantially."
      },
      {
        "label": "C",
        "text": "the demand for a stock to decrease substantially."
      },
      {
        "label": "D",
        "text": "the supply of a stock to increase substantially."
      }
    ],
    "answer": "B"
  },
  {
    "id": 176,
    "topic": "Investments",
    "stem": "As defined in the Securities Exchange Act of 1934, the term municipal security would include all of the following EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "a City of Chicago school district bond"
      },
      {
        "label": "B",
        "text": "50-year bonds issued by the Tennessee Valley Authority"
      },
      {
        "label": "C",
        "text": "a U.S. Treasury bill"
      },
      {
        "label": "D",
        "text": "a Province of Ontario library construction bond"
      }
    ],
    "answer": "A"
  },
  {
    "id": 177,
    "topic": "Client Management",
    "stem": "Municipal bonds are often called tax-exempts. This refers to the exemption of their income from",
    "options": [
      {
        "label": "A",
        "text": "federal income taxes"
      },
      {
        "label": "B",
        "text": "federal estate taxes"
      },
      {
        "label": "C",
        "text": "state income taxes"
      },
      {
        "label": "D",
        "text": "state, federal, and inheritance taxes"
      }
    ],
    "answer": "A"
  },
  {
    "id": 178,
    "topic": "Investments",
    "stem": "Kate, age 59, has an investment portfolio exceeding $250,000. She considers herself a moderate to conservative investor. To generate additional income, she is anticipating adding bonds to her portfolio. She lives in a state that does not have an income tax and she is in the 28% federal income tax bracket. Which of the following bonds would be the best recommendation for her portfolio?",
    "options": [
      {
        "label": "A",
        "text": "Bond A, A-rated corporate debenture with a 6.5% coupon rate"
      },
      {
        "label": "B",
        "text": "Bond C, CCC-rated corporate debenture with an 8% coupon rate"
      },
      {
        "label": "C",
        "text": "Bond D, AAA-rated Treasury note with a 2.55% coupon rate"
      },
      {
        "label": "D",
        "text": "Bond B, BBB-rated municipal bond with a 3.75% coupon rate"
      }
    ],
    "answer": "A"
  },
  {
    "id": 179,
    "topic": "Client Management",
    "stem": "A client in the 28% marginal federal income tax bracket invests in a corporate bond with an 8% coupon. To calculate the client's after-tax rate of return,",
    "options": [
      {
        "label": "A",
        "text": "divide 0.08 by 0.28"
      },
      {
        "label": "B",
        "text": "divide 0.08 by 0.72"
      },
      {
        "label": "C",
        "text": "multiply 0.08 by 0.28"
      },
      {
        "label": "D",
        "text": "multiply 0.08 by 0.72"
      }
    ],
    "answer": "D"
  },
  {
    "id": 180,
    "topic": "Client Management",
    "stem": "Your client in the 25% federal income tax bracket lives in a state where his earnings place him in the 6% bracket for state income tax purposes. If he were to purchase a 4% bond issued by a political subdivision of his state, his total tax-equivalent yield would be",
    "options": [
      {
        "label": "A",
        "text": "slightly more than 5.33%"
      },
      {
        "label": "B",
        "text": "approximately 12.90%"
      },
      {
        "label": "C",
        "text": "slightly less than 5.33%"
      },
      {
        "label": "D",
        "text": "4%"
      }
    ],
    "answer": "A"
  },
  {
    "id": 181,
    "topic": "Client Management",
    "stem": "Your client in the 35% federal income tax bracket currently owns some corporate bonds with a coupon yield of 7%. In order to receive the same income after taxes, he would need to buy municipal bonds with a coupon of",
    "options": [
      {
        "label": "A",
        "text": "7.00%"
      },
      {
        "label": "B",
        "text": "2.45%"
      },
      {
        "label": "C",
        "text": "9.45%"
      },
      {
        "label": "D",
        "text": "4.55%"
      }
    ],
    "answer": "D"
  },
  {
    "id": 182,
    "topic": "Client Management",
    "stem": "Which of the following choices offers the highest tax-equivalent yield?",
    "options": [
      {
        "label": "A",
        "text": "5.8% municipal bond to an individual in the 25% tax bracket"
      },
      {
        "label": "B",
        "text": "5.5% municipal bond to an individual in the 28% tax bracket"
      },
      {
        "label": "C",
        "text": "5% municipal bond to an individual in the 35% tax bracket"
      },
      {
        "label": "D",
        "text": "6.2% municipal bond to a corporation in the 21% tax bracket"
      }
    ],
    "answer": "D"
  },
  {
    "id": 183,
    "topic": "Client Management",
    "stem": "Which of the following investments would provide the highest after-tax income to your client in the 35% federal income tax bracket?",
    "options": [
      {
        "label": "A",
        "text": "6% U.S. Treasury bond"
      },
      {
        "label": "B",
        "text": "5% general obligation municipal bond issued by State H"
      },
      {
        "label": "C",
        "text": "7% bond issued by Canadian Province M"
      },
      {
        "label": "D",
        "text": "8% debenture issued by the LMN Corporation"
      }
    ],
    "answer": "D"
  },
  {
    "id": 184,
    "topic": "Investments",
    "stem": "When a corporation domiciled in the U.K. issues U.S. dollar-denominated bonds in the United States, it is issuing",
    "options": [
      {
        "label": "A",
        "text": "Eurobonds."
      },
      {
        "label": "B",
        "text": "ADRs."
      },
      {
        "label": "C",
        "text": "Ameribonds."
      },
      {
        "label": "D",
        "text": "Yankee bonds."
      }
    ],
    "answer": "D"
  },
  {
    "id": 185,
    "topic": "Investments",
    "stem": "An investor interested in investing in sovereign debt would most likely purchase",
    "options": [
      {
        "label": "A",
        "text": "bonds backed by gold sovereigns."
      },
      {
        "label": "B",
        "text": "European Central Bank debt issues."
      },
      {
        "label": "C",
        "text": "Sweden 2.5s of 2032."
      },
      {
        "label": "D",
        "text": "bonds issued by the Bank of the United States."
      }
    ],
    "answer": "C"
  },
  {
    "id": 186,
    "topic": "Investments",
    "stem": "Which of the following statements represents an advantage of a municipal general obligation bond over a revenue bond?",
    "options": [
      {
        "label": "A",
        "text": "A GO bond is not charged against the municipality's borrowing limits."
      },
      {
        "label": "B",
        "text": "A GO bond issuer is required to conduct a feasibility study."
      },
      {
        "label": "C",
        "text": "Only a facility's users pay for a GO bond."
      },
      {
        "label": "D",
        "text": "A GO bond generally involves less risk to the investor."
      }
    ],
    "answer": "D"
  },
  {
    "id": 187,
    "topic": "Investments",
    "stem": "Which of the following would best describes a Yankee bond?",
    "options": [
      {
        "label": "A",
        "text": "U.S. dollar-denominated bond issued by a U.S. entity inside the United States"
      },
      {
        "label": "B",
        "text": "U.S. dollar-denominated bond issued by a non-U.S. entity inside the United States"
      },
      {
        "label": "C",
        "text": "U.S. dollar-denominated bond issued by a non-U.S. entity outside the United States"
      },
      {
        "label": "D",
        "text": "U.S. dollar-denominated bond issued by a U.S. entity outside the United States"
      }
    ],
    "answer": "B"
  },
  {
    "id": 188,
    "topic": "Investments",
    "stem": "Which of the following would best describe a Yankee bond?",
    "options": [
      {
        "label": "A",
        "text": "A U.S. dollar–denominated bond issued by a U.S. entity outside the United States."
      },
      {
        "label": "B",
        "text": "A U.S. dollar–denominated bond issued by a non-U.S. entity outside the United States."
      },
      {
        "label": "C",
        "text": "A U.S. dollar–denominated bond issued by a non-U.S. entity inside the United States"
      },
      {
        "label": "D",
        "text": "A U.S. dollar–denominated bond issued by a U.S. entity inside the United States."
      }
    ],
    "answer": "C"
  },
  {
    "id": 189,
    "topic": "Investments",
    "stem": "Of the following securities, which is most commonly recommended to fund a child's college education?",
    "options": [
      {
        "label": "A",
        "text": "Zero-coupon Treasury bonds"
      },
      {
        "label": "B",
        "text": "Investment-grade corporate bonds"
      },
      {
        "label": "C",
        "text": "Treasury bills"
      },
      {
        "label": "D",
        "text": "Municipal bonds"
      }
    ],
    "answer": "A"
  },
  {
    "id": 190,
    "topic": "Investments",
    "stem": "The call feature available on some bonds",
    "options": [
      {
        "label": "A",
        "text": "allows the issuer the option to escape high interest rates if market rates decline."
      },
      {
        "label": "B",
        "text": "may be used to convert the bond into preferred shares."
      },
      {
        "label": "C",
        "text": "allows bond issuers to extend the life of the bond."
      },
      {
        "label": "D",
        "text": "allows the issuer to refinance the debt if interest rates rise above the call rate."
      }
    ],
    "answer": "A"
  },
  {
    "id": 191,
    "topic": "Investments",
    "stem": "If a corporate bond is a convertible bond, this means that",
    "options": [
      {
        "label": "A",
        "text": "the owner of the bond may exchange it for a set number of shares of stock"
      },
      {
        "label": "B",
        "text": "the owner of the bond may exchange it for a bond paying a higher coupon rate"
      },
      {
        "label": "C",
        "text": "the owner of the bond may exchange it for a debenture"
      },
      {
        "label": "D",
        "text": "the corporation may redeem the bond before its maturity date"
      }
    ],
    "answer": "A"
  },
  {
    "id": 192,
    "topic": "Investments",
    "stem": "Which of the following statements regarding callable bonds is correct?",
    "options": [
      {
        "label": "A",
        "text": "They offer lower yields than comparable noncallable bonds."
      },
      {
        "label": "B",
        "text": "They usually provide a call risk premium."
      },
      {
        "label": "C",
        "text": "They are only issued by government entities."
      },
      {
        "label": "D",
        "text": "They are unaffected by changes in market yields."
      }
    ],
    "answer": "B"
  },
  {
    "id": 193,
    "topic": "Investments",
    "stem": "Which of the following statements regarding convertible debentures is TRUE?",
    "options": [
      {
        "label": "A",
        "text": "The issuer pays a higher rate of interest, compared with a comparable nonconvertible debenture."
      },
      {
        "label": "B",
        "text": "The debenture holders receive a variable rate of interest."
      },
      {
        "label": "C",
        "text": "The issuer has the right to convert the debentures during the time period specified in the indenture."
      },
      {
        "label": "D",
        "text": "When compared with similar nonconvertible debentures, convertible debentures are issued with a lower coupon rate."
      }
    ],
    "answer": "D"
  },
  {
    "id": 194,
    "topic": "Investments",
    "stem": "A U.S. dollar-denominated bond issued by a non-American company (or government), sold outside the United States and the issuer's country, but for which the principal and interest are stated and paid in U.S. dollars is best described as",
    "options": [
      {
        "label": "A",
        "text": "a Brady bond."
      },
      {
        "label": "B",
        "text": "a Eurodollar bond."
      },
      {
        "label": "C",
        "text": "a Eurobond."
      },
      {
        "label": "D",
        "text": "a Yankee bond."
      }
    ],
    "answer": "B"
  },
  {
    "id": 195,
    "topic": "Economics",
    "stem": "When a U.S. resident investor purchases foreign bonds,",
    "options": [
      {
        "label": "A",
        "text": "depreciation of the bonds and appreciation of the foreign currency benefit the domestic investor."
      },
      {
        "label": "B",
        "text": "appreciation of both the bonds and the foreign currency benefits the domestic investor."
      },
      {
        "label": "C",
        "text": "depreciation of both the bonds and the foreign currency benefits the domestic investor."
      },
      {
        "label": "D",
        "text": "appreciation of the bonds and depreciation of the foreign currency benefit the domestic investor."
      }
    ],
    "answer": "B"
  },
  {
    "id": 196,
    "topic": "Investments",
    "stem": "If your customer wants to set aside $40,000 for when his child starts college, but does not want to endanger the principal, you should recommend",
    "options": [
      {
        "label": "A",
        "text": "common stock"
      },
      {
        "label": "B",
        "text": "zero-coupon bonds backed by the U.S. Treasury"
      },
      {
        "label": "C",
        "text": "municipal bonds for their tax benefits"
      },
      {
        "label": "D",
        "text": "corporate bonds with high rates of interest"
      }
    ],
    "answer": "B"
  },
  {
    "id": 197,
    "topic": "Economics",
    "stem": "The term \"eurodollars\" refers to",
    "options": [
      {
        "label": "A",
        "text": "European currency held in U.S. banks"
      },
      {
        "label": "B",
        "text": "a worldwide currency system that is expected to someday replace existing currency systems"
      },
      {
        "label": "C",
        "text": "obsolete currency that was formerly backed by the gold standard"
      },
      {
        "label": "D",
        "text": "American dollars held by banks in other countries, especially in Europe"
      }
    ],
    "answer": "D"
  },
  {
    "id": 198,
    "topic": "Investments",
    "stem": "Which of the following investments gives the investor the least exposure to reinvestment risk?",
    "options": [
      {
        "label": "A",
        "text": "Treasury STRIPS\\/zero-coupon bonds"
      },
      {
        "label": "B",
        "text": "Preferred stock in a growth company"
      },
      {
        "label": "C",
        "text": "Treasury notes"
      },
      {
        "label": "D",
        "text": "Common stock in an electric utility"
      }
    ],
    "answer": "A"
  },
  {
    "id": 199,
    "topic": "Investments",
    "stem": "Your customer owns $100 par 5½% callable convertible preferred stock convertible into 4 shares of common stock at $25. What should she be advised to do if the board of directors were to call all the preferred at 106 when the common stock is trading at $25.50?",
    "options": [
      {
        "label": "A",
        "text": "Convert her preferred stock into common stock because it is selling above parity."
      },
      {
        "label": "B",
        "text": "Hold the preferred stock to continue the 5½% yield."
      },
      {
        "label": "C",
        "text": "Present the preferred stock for the call because the call price is $4 above the parity price."
      },
      {
        "label": "D",
        "text": "Place irrevocable instructions to convert the preferred stock into common stock and sell short the common stock immediately."
      }
    ],
    "answer": "C"
  },
  {
    "id": 200,
    "topic": "Investments",
    "stem": "An investor interested in acquiring a convertible bond as part of his investment portfolio would",
    "options": [
      {
        "label": "A",
        "text": "be interested in tax advantages available to convertible debt securities"
      },
      {
        "label": "B",
        "text": "seek to minimize changes in the bond price during periods of steady interest rates"
      },
      {
        "label": "C",
        "text": "want the safety of a fixed-income investment along with potential capital appreciation"
      },
      {
        "label": "D",
        "text": "want the assurance of a guaranteed dividend on the underlying common stock"
      }
    ],
    "answer": "C"
  },
  {
    "id": 201,
    "topic": "Regulations & Ethics",
    "stem": "When does a customer have to receive the OCC Options Disclosure Document?",
    "options": [
      {
        "label": "A",
        "text": "Within 15 days of account approval by the firm's designated options supervisor"
      },
      {
        "label": "B",
        "text": "Before accepting the customer’s first order to trade options covered by the ODD"
      },
      {
        "label": "C",
        "text": "With the confirmation of the first options transaction"
      },
      {
        "label": "D",
        "text": "Within 5 business days of the first options trade"
      }
    ],
    "answer": "B"
  },
  {
    "id": 202,
    "topic": "Regulations & Ethics",
    "stem": "An investment adviser registered in 4 states would be permitted to enter into an advisory contract with all of the following prospective clients except",
    "options": [
      {
        "label": "A",
        "text": "a university endowment fund."
      },
      {
        "label": "B",
        "text": "a single parent."
      },
      {
        "label": "C",
        "text": "a registered investment company."
      },
      {
        "label": "D",
        "text": "a charitable foundation."
      }
    ],
    "answer": "C"
  },
  {
    "id": 203,
    "topic": "Regulations & Ethics",
    "stem": "An investment adviser would be able to enter into an advisory contract with all of the following except",
    "options": [
      {
        "label": "A",
        "text": "a minor."
      },
      {
        "label": "B",
        "text": "a philanthropic foundation."
      },
      {
        "label": "C",
        "text": "three brothers in a joint account."
      },
      {
        "label": "D",
        "text": "a closed-end investment company."
      }
    ],
    "answer": "A"
  },
  {
    "id": 204,
    "topic": "Regulations & Ethics",
    "stem": "A registered broker-dealer would not be able to open an account for",
    "options": [
      {
        "label": "A",
        "text": "a person deemed mentally incompetent."
      },
      {
        "label": "B",
        "text": "the CEO of a company whose stock is NYSE-traded."
      },
      {
        "label": "C",
        "text": "two unrelated individuals."
      },
      {
        "label": "D",
        "text": "the estate of a deceased individual."
      }
    ],
    "answer": "A"
  },
  {
    "id": 205,
    "topic": "Regulations & Ethics",
    "stem": "A registered broker-dealer would not be able to open an account for",
    "options": [
      {
        "label": "A",
        "text": "a deceased individual."
      },
      {
        "label": "B",
        "text": "a convicted felon."
      },
      {
        "label": "C",
        "text": "the American Cancer Society."
      },
      {
        "label": "D",
        "text": "the sovereign government of Poland."
      }
    ],
    "answer": "A"
  },
  {
    "id": 206,
    "topic": "Regulations & Ethics",
    "stem": "An investment adviser registered in 4 states would be permitted to enter into an advisory contract with all of the following prospective clients except",
    "options": [
      {
        "label": "A",
        "text": "a bank."
      },
      {
        "label": "B",
        "text": "an insurance company."
      },
      {
        "label": "C",
        "text": "a minor."
      },
      {
        "label": "D",
        "text": "a trust."
      }
    ],
    "answer": "C"
  },
  {
    "id": 207,
    "topic": "Client Management",
    "stem": "A broker-dealer would not be able to open an account for",
    "options": [
      {
        "label": "A",
        "text": "a trust."
      },
      {
        "label": "B",
        "text": "the estate of a deceased person."
      },
      {
        "label": "C",
        "text": "a city."
      },
      {
        "label": "D",
        "text": "a deceased person"
      }
    ],
    "answer": "D"
  },
  {
    "id": 208,
    "topic": "Regulations & Ethics",
    "stem": "Among the clients of a broker-dealer could be",
    "options": [
      {
        "label": "A",
        "text": "a minor."
      },
      {
        "label": "B",
        "text": "a deceased individual."
      },
      {
        "label": "C",
        "text": "a foundation."
      },
      {
        "label": "D",
        "text": "an individual declared mentally incompetent."
      }
    ],
    "answer": "C"
  },
  {
    "id": 209,
    "topic": "Regulations & Ethics",
    "stem": "Ms. Abbot has a joint account with her sister. She enters a sell order in the account and instructs that the proceeds check be made out to her only. If your firm sends the check but makes it payable to both Ms. Abbot and her sister, this is an example of",
    "options": [
      {
        "label": "A",
        "text": "not following instructions, a prohibited practice under the Uniform Securities Act"
      },
      {
        "label": "B",
        "text": "an unlawful practice because the transaction was unauthorized"
      },
      {
        "label": "C",
        "text": "an unfortunate error that can be reconciled with the broker-dealer through a process called reclamation"
      },
      {
        "label": "D",
        "text": "the proper joint account procedure"
      }
    ],
    "answer": "D"
  },
  {
    "id": 210,
    "topic": "Investments",
    "stem": "One respect in which an LLC differs from an S corporation is that",
    "options": [
      {
        "label": "A",
        "text": "there is no statutory limit on the number of investors in an LLC"
      },
      {
        "label": "B",
        "text": "an LLC can be formed with as little as a single investor"
      },
      {
        "label": "C",
        "text": "there is more favorable tax treatment afforded to members of an LLC"
      },
      {
        "label": "D",
        "text": "not only income, but losses, if generated, pass through to investors in an LLC"
      }
    ],
    "answer": "A"
  },
  {
    "id": 211,
    "topic": "Investments",
    "stem": "An S corporation is characterized by",
    "options": [
      {
        "label": "A",
        "text": "flow-through tax treatment"
      },
      {
        "label": "B",
        "text": "limited lifetime"
      },
      {
        "label": "C",
        "text": "more than 100 shareholders"
      },
      {
        "label": "D",
        "text": "unlimited personal liability"
      }
    ],
    "answer": "A"
  },
  {
    "id": 212,
    "topic": "Investments",
    "stem": "In an account opened by 2 individuals as joint tenants with rights of survivorship, all of the following are true EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "in the event of death, the other party assumes full ownership of the account"
      },
      {
        "label": "B",
        "text": "orders may be entered by either party"
      },
      {
        "label": "C",
        "text": "mail may be directed to the joint owner agreed upon by both parties to the account"
      },
      {
        "label": "D",
        "text": "stock certificates may be delivered in the name of either party"
      }
    ],
    "answer": "D"
  },
  {
    "id": 213,
    "topic": "Investments",
    "stem": "Suzie McQueen has a very successful interior design shop she has run as a sole proprietorship. She has just celebrated her 60th birthday and has been giving thought to an eventual sale of the business. She wants your opinion on whether she should incorporate or change to a partnership. You might respond that",
    "options": [
      {
        "label": "A",
        "text": "the partnership form of business structure would be the easiest for ultimate transfer of ownership"
      },
      {
        "label": "B",
        "text": "the partnership form of business structure would enable Suzie to maximize her sale price"
      },
      {
        "label": "C",
        "text": "the corporate form of business structure would be the easiest for ultimate transfer of ownership"
      },
      {
        "label": "D",
        "text": "the corporate form of business structure would be the least expensive to form"
      }
    ],
    "answer": "C"
  },
  {
    "id": 214,
    "topic": "Investments",
    "stem": "Under the provisions of the Internal Revenue Code, which of the following business forms is not required to file a separate tax return?",
    "options": [
      {
        "label": "A",
        "text": "S corporation"
      },
      {
        "label": "B",
        "text": "Limited partnership"
      },
      {
        "label": "C",
        "text": "LLC"
      },
      {
        "label": "D",
        "text": "Sole proprietorship"
      }
    ],
    "answer": "D"
  },
  {
    "id": 215,
    "topic": "Investments",
    "stem": "A form of business structure that exposes all personal assets of the owner to creditors is",
    "options": [
      {
        "label": "A",
        "text": "the LLC"
      },
      {
        "label": "B",
        "text": "the limited partnerships"
      },
      {
        "label": "C",
        "text": "the C corporation"
      },
      {
        "label": "D",
        "text": "the sole proprietorship"
      }
    ],
    "answer": "D"
  },
  {
    "id": 216,
    "topic": "Regulations & Ethics",
    "stem": "A man is planning to start his own glass-sculpturing business. He wants to be able to deduct his anticipated losses for the first 2 years. He anticipates that the enterprise will borrow money from lenders and is willing to personally guarantee the debt. He also wants to attract other investors but does not want to give up control of the day-to-day business decisions. What business form do you recommend?",
    "options": [
      {
        "label": "A",
        "text": "Limited partnership"
      },
      {
        "label": "B",
        "text": "S corporation"
      },
      {
        "label": "C",
        "text": "General partnership"
      },
      {
        "label": "D",
        "text": "C corporations"
      }
    ],
    "answer": "A"
  },
  {
    "id": 217,
    "topic": "Investments",
    "stem": "If 150 investors want to form a corporation to limit their financial liability to the amount of money they invest and do not want to be responsible for any debt that the corporation incurs, they would most likely form",
    "options": [
      {
        "label": "A",
        "text": "a C corporation"
      },
      {
        "label": "B",
        "text": "an S corporation"
      },
      {
        "label": "C",
        "text": "a general partnership"
      },
      {
        "label": "D",
        "text": "a proprietorship"
      }
    ],
    "answer": "A"
  },
  {
    "id": 218,
    "topic": "Investments",
    "stem": "Among the advantages of forming an S corporation rather than a C corporation for a new business enterprise is",
    "options": [
      {
        "label": "A",
        "text": "shareholders’ losses are limited to the amount of their investment"
      },
      {
        "label": "B",
        "text": "any losses flow through to the investors"
      },
      {
        "label": "C",
        "text": "unlike the C corporation, which is limited to 100 investors, there is no such limit for an S corporation"
      },
      {
        "label": "D",
        "text": "the ease in raising substantial amounts of capital."
      }
    ],
    "answer": "B"
  },
  {
    "id": 219,
    "topic": "Investments",
    "stem": "The type of business organization in which one person owns the entire business and there is no legal distinction between that individual and the business is",
    "options": [
      {
        "label": "A",
        "text": "a corporation"
      },
      {
        "label": "B",
        "text": "a sole proprietorship"
      },
      {
        "label": "C",
        "text": "a limited partnership"
      },
      {
        "label": "D",
        "text": "a general partnership"
      }
    ],
    "answer": "B"
  },
  {
    "id": 220,
    "topic": "Regulations & Ethics",
    "stem": "Because a trust account is managed for the beneficial interest of the beneficiary, the investment adviser representative can",
    "options": [
      {
        "label": "A",
        "text": "have a check drawn on the account payable to the trustee for expenses"
      },
      {
        "label": "B",
        "text": "place the securities in the trust fund in a noncustodial brokerage account"
      },
      {
        "label": "C",
        "text": "have funds withdrawn from the account at the direction of the beneficiary"
      },
      {
        "label": "D",
        "text": "arrange to have the trust's funds pledged to support a loan for the trustee"
      }
    ],
    "answer": "A"
  },
  {
    "id": 221,
    "topic": "Client Management",
    "stem": "Alvin's spouse is a trustee of a trust established by Henrietta Flood, which directs income from the trust be paid to Alvin, for as long as he lives. Alvin's son, Floyd, will receive the principal upon Alvin's death. Floyd would like to receive some of the principal before Alvin's death, and Alvin does not object. How should his spouse, the trustee, act in this situation?",
    "options": [
      {
        "label": "A",
        "text": "Distribute part of the income to Floyd."
      },
      {
        "label": "B",
        "text": "Distribute part of the principal to Floyd."
      },
      {
        "label": "C",
        "text": "Distribute all of the principal to Floyd."
      },
      {
        "label": "D",
        "text": "Follow the trust terms, continuing to distribute the income to Alvin and the principal to Floyd upon Alvin's death."
      }
    ],
    "answer": "D"
  },
  {
    "id": 222,
    "topic": "Client Management",
    "stem": "Your advisory client is an 86-year-old woman who is presently in the hospital, unable to communicate due to a severe stroke. For the past 6 years, she has followed the practice of making annual gifts of stock to her children and grandchildren on her birthday. Because her 87th is coming up later this month, her oldest son approaches you and asks you to continue the policy.",
    "options": [
      {
        "label": "A",
        "text": "With 6 years of prior history, you know this is what she would want you to do so you go ahead as in previous years."
      },
      {
        "label": "B",
        "text": "Without a proper durable power of attorney being produced, you cannot do anything."
      },
      {
        "label": "C",
        "text": "You should go to the hospital and see if she can blink her eyes to indicate yes or no."
      },
      {
        "label": "D",
        "text": "You may only follow the provisions of her will."
      }
    ],
    "answer": "B"
  },
  {
    "id": 223,
    "topic": "Investments",
    "stem": "A feature of which of the following business entities is limited liability but no flow-through of earnings or losses?",
    "options": [
      {
        "label": "A",
        "text": "Sole proprietorship"
      },
      {
        "label": "B",
        "text": "Corporation"
      },
      {
        "label": "C",
        "text": "Limited partnership"
      },
      {
        "label": "D",
        "text": "LLC"
      }
    ],
    "answer": "B"
  },
  {
    "id": 224,
    "topic": "Client Management",
    "stem": "When a trustee is managing the trust assets, which of the following is the most important consideration?",
    "options": [
      {
        "label": "A",
        "text": "Preservation of capital"
      },
      {
        "label": "B",
        "text": "Reasonable income"
      },
      {
        "label": "C",
        "text": "Minimizing expenses"
      },
      {
        "label": "D",
        "text": "The purposes, terms, distribution requirements, and other circumstances of the trust"
      }
    ],
    "answer": "D"
  },
  {
    "id": 225,
    "topic": "Regulations & Ethics",
    "stem": "In a trust account, the person who makes the account management decisions is",
    "options": [
      {
        "label": "A",
        "text": "the investment adviser representative"
      },
      {
        "label": "B",
        "text": "the trustee"
      },
      {
        "label": "C",
        "text": "the nontrustee custodian"
      },
      {
        "label": "D",
        "text": "the beneficiary"
      }
    ],
    "answer": "B"
  },
  {
    "id": 226,
    "topic": "Client Management",
    "stem": "One major difference between the customer identification program (CIP) and the new account opening rules of the regulatory bodies is that",
    "options": [
      {
        "label": "A",
        "text": "the CIP requires a residence address for individuals while the regulatory bodies will accept a PO Box"
      },
      {
        "label": "B",
        "text": "the CIP only applies to individuals while the rules of the regulators apply to retail and institutional accounts"
      },
      {
        "label": "C",
        "text": "the CIP requires a statement of the customer’s goals while the regulators only require current financial information"
      },
      {
        "label": "D",
        "text": "the CIP requires date of birth while the regulators only require proof of legal age"
      }
    ],
    "answer": "D"
  },
  {
    "id": 227,
    "topic": "Client Management",
    "stem": "One of the portions of the USA PATRIOT Act of 2001that affects the opening of an account for a new customer is",
    "options": [
      {
        "label": "A",
        "text": "the customer identification program"
      },
      {
        "label": "B",
        "text": "the “know-your-customer rule"
      },
      {
        "label": "C",
        "text": "the Transportation Security Administration (TSA)"
      },
      {
        "label": "D",
        "text": "the requirement to obtain suitability information"
      }
    ],
    "answer": "A"
  },
  {
    "id": 228,
    "topic": "Client Management",
    "stem": "All the following information must be obtained from new individual customers EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "educational background"
      },
      {
        "label": "B",
        "text": "Social Security number"
      },
      {
        "label": "C",
        "text": "date of birth"
      },
      {
        "label": "D",
        "text": "physical address"
      }
    ],
    "answer": "A"
  },
  {
    "id": 229,
    "topic": "Regulations & Ethics",
    "stem": "A woman wants to buy from an agent who is not registered in her state. She decides to use a friend's address in the state in which the agent is licensed. This action is",
    "options": [
      {
        "label": "A",
        "text": "acceptable as long as she has her friend's permission to use the address"
      },
      {
        "label": "B",
        "text": "acceptable because the agent can do business only with those who have a residence address in those states in which he is registered"
      },
      {
        "label": "C",
        "text": "not acceptable because the other party does not know you are using the address"
      },
      {
        "label": "D",
        "text": "not acceptable because there are no circumstances under which you are permitted to use someone else's address as yours"
      }
    ],
    "answer": "D"
  },
  {
    "id": 230,
    "topic": "Regulations & Ethics",
    "stem": "When does a customer have to receive the OCC Options Disclosure Document?",
    "options": [
      {
        "label": "A",
        "text": "At or prior to the time the account is approved for options trading"
      },
      {
        "label": "B",
        "text": "With the confirmation of his first options transaction"
      },
      {
        "label": "C",
        "text": "Within 5 business days of the first options trade"
      },
      {
        "label": "D",
        "text": "Within 15 days of account approval"
      }
    ],
    "answer": "A"
  },
  {
    "id": 231,
    "topic": "Investments",
    "stem": "Which of the following is NOT a characteristic of a corporation?",
    "options": [
      {
        "label": "A",
        "text": "It is considered an entity apart from its owners."
      },
      {
        "label": "B",
        "text": "Ownership interests are evidenced by shares of stock."
      },
      {
        "label": "C",
        "text": "Owners have no personal liability for corporate debts."
      },
      {
        "label": "D",
        "text": "Existence terminates when an owner dies."
      }
    ],
    "answer": "D"
  },
  {
    "id": 232,
    "topic": "Client Management",
    "stem": "Two sisters might wish to open an account as tenants in common (TIC) rather than JTWROS in order to",
    "options": [
      {
        "label": "A",
        "text": "ensure that their respective shares go to their heirs instead of the surviving sister."
      },
      {
        "label": "B",
        "text": "limit the right of each party to withdraw assets from the account."
      },
      {
        "label": "C",
        "text": "provide for an undivided interest in the assets of the account."
      },
      {
        "label": "D",
        "text": "allow the spouse of each sister to have access to the account."
      }
    ],
    "answer": "A"
  },
  {
    "id": 233,
    "topic": "Client Management",
    "stem": "If a new joint tenants with rights of survivorship account is opened by two related individuals, all of the following statements are true EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "orders may be given by either party"
      },
      {
        "label": "B",
        "text": "mail may be sent to either party (with the permission of each party)"
      },
      {
        "label": "C",
        "text": "in the event of death, the decedent's interest in the account goes to the other party"
      },
      {
        "label": "D",
        "text": "checks may be drawn in the name of either party"
      }
    ],
    "answer": "D"
  },
  {
    "id": 234,
    "topic": "Regulations & Ethics",
    "stem": "All of the following statements relating to an account registered as tenants in common are true EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "cotenants can own unequal percentages of the assets in the account"
      },
      {
        "label": "B",
        "text": "each cotenant has an undivided interest in the entire account"
      },
      {
        "label": "C",
        "text": "upon the death of one of the cotenants, that individual’s share of the account passes to the survivor(s)"
      },
      {
        "label": "D",
        "text": "this form of registration is less common for married couples than JTWROS"
      }
    ],
    "answer": "C"
  },
  {
    "id": 235,
    "topic": "Investments",
    "stem": "If a businessowner's goal is to establish an entity that features ease in raising capital, which of these entities is the most appropriate?",
    "options": [
      {
        "label": "A",
        "text": "An S form of corporation"
      },
      {
        "label": "B",
        "text": "A general partnership"
      },
      {
        "label": "C",
        "text": "A limited liability company (LLC)"
      },
      {
        "label": "D",
        "text": "A sole proprietorship"
      }
    ],
    "answer": "C"
  },
  {
    "id": 236,
    "topic": "Client Management",
    "stem": "The customer identification program (CIP) requires that certain information relating to new customers be obtained. Included in that requirement for individual clients who are citizens of the United States are all of the following EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "current employment status"
      },
      {
        "label": "B",
        "text": "a physical address"
      },
      {
        "label": "C",
        "text": "Social Security number"
      },
      {
        "label": "D",
        "text": "date of birth"
      }
    ],
    "answer": "A"
  },
  {
    "id": 237,
    "topic": "Client Management",
    "stem": "Which of the following documents would aid an investment adviser in its responsibility to fully understand the needs of a client when making investment recommendations?",
    "options": [
      {
        "label": "A",
        "text": "A proxy voting policy."
      },
      {
        "label": "B",
        "text": "A restricted list."
      },
      {
        "label": "C",
        "text": "A communications agreement."
      },
      {
        "label": "D",
        "text": "An investment policy statement."
      }
    ],
    "answer": "D"
  },
  {
    "id": 238,
    "topic": "Client Management",
    "stem": "If an investment adviser's client wishes to save current income taxes by placing certain investments in a charitable trust, ethically, the investment adviser should",
    "options": [
      {
        "label": "A",
        "text": "recommend the client consult with a qualified attorney"
      },
      {
        "label": "B",
        "text": "refuse to discuss the trust with the client because the adviser is not an attorney"
      },
      {
        "label": "C",
        "text": "help the client draft the appropriate documents following a discussion of the advantages of the arrangement"
      },
      {
        "label": "D",
        "text": "urge the client to consult with an attorney who pays a referral fee to the investment adviser"
      }
    ],
    "answer": "A"
  },
  {
    "id": 239,
    "topic": "Client Management",
    "stem": "With respect to taxation, an investment adviser representative should NOT",
    "options": [
      {
        "label": "A",
        "text": "explain the taxable status of particular investments"
      },
      {
        "label": "B",
        "text": "draft tax and estate documents to ensure compliance with current law to provide substantial after-tax returns"
      },
      {
        "label": "C",
        "text": "discuss the tax implications of investments"
      },
      {
        "label": "D",
        "text": "consider tax implications as a way of improving a client's after-tax returns"
      }
    ],
    "answer": "B"
  },
  {
    "id": 240,
    "topic": "Client Management",
    "stem": "One of your clients dies. You could legally take instructions regarding the individual's estate from",
    "options": [
      {
        "label": "A",
        "text": "a CPA who prepared the deceased’s tax return"
      },
      {
        "label": "B",
        "text": "the spouse of the deceased"
      },
      {
        "label": "C",
        "text": "a person with durable power of attorney"
      },
      {
        "label": "D",
        "text": "the administrator in intestacy"
      }
    ],
    "answer": "D"
  },
  {
    "id": 241,
    "topic": "Regulations & Ethics",
    "stem": "A professional tennis player comes to you seeking advice on setting up a trust. She is interested in giving to charity and also wants discretion as to when income is distributed to the beneficiaries, her parents. Which trust do you advise she use?",
    "options": [
      {
        "label": "A",
        "text": "Charitable lead trust"
      },
      {
        "label": "B",
        "text": "Simple trust"
      },
      {
        "label": "C",
        "text": "Complex trust"
      },
      {
        "label": "D",
        "text": "Charitable remainder trust"
      }
    ],
    "answer": "C"
  },
  {
    "id": 242,
    "topic": "Regulations & Ethics",
    "stem": "An estate account is opened with Family Asset Protectors (FAP) a registered investment adviser. Management decisions regarding the account must be made at the direction of the",
    "options": [
      {
        "label": "A",
        "text": "attorney with guardianship over the surviving children"
      },
      {
        "label": "B",
        "text": "investment adviser"
      },
      {
        "label": "C",
        "text": "estate’s executor or administrator"
      },
      {
        "label": "D",
        "text": "estate creditors"
      }
    ],
    "answer": "C"
  },
  {
    "id": 243,
    "topic": "Investments",
    "stem": "The distributable net income (DNI) of a simple trust would not include",
    "options": [
      {
        "label": "A",
        "text": "dividends received."
      },
      {
        "label": "B",
        "text": "interest received on municipal bonds."
      },
      {
        "label": "C",
        "text": "interest received on corporate bonds."
      },
      {
        "label": "D",
        "text": "realized capital gains."
      }
    ],
    "answer": "D"
  },
  {
    "id": 244,
    "topic": "Client Management",
    "stem": "If a customer who has granted a durable power of attorney to her son dies, which of the following statements regarding the power of attorney is TRUE?",
    "options": [
      {
        "label": "A",
        "text": "It is canceled on the death of either principal."
      },
      {
        "label": "B",
        "text": "It remains in effect until the son cancels it."
      },
      {
        "label": "C",
        "text": "It remains in effect until the executor of the estate cancels it."
      },
      {
        "label": "D",
        "text": "It remains in effect only if the son is the sole heir to the estate."
      }
    ],
    "answer": "A"
  },
  {
    "id": 245,
    "topic": "Regulations & Ethics",
    "stem": "As a registered investment adviser, you have managed $10 million of a customer's funds for several years. The customer asks you to prepare a trust for his children, to transfer $3 million of his funds into the trust, and to trade the trust with the same objectives as the existing account. You should",
    "options": [
      {
        "label": "A",
        "text": "prepare the trust, transfer funds, and begin investing"
      },
      {
        "label": "B",
        "text": "explain to the customer that trusts cannot be traded"
      },
      {
        "label": "C",
        "text": "refer the customer to an attorney that can set up the trust"
      },
      {
        "label": "D",
        "text": "tell the customer to contact a tax specialist"
      }
    ],
    "answer": "C"
  },
  {
    "id": 246,
    "topic": "Investments",
    "stem": "Increasingly, many institutional investors, especially those in the philanthropic arena, are using ESG factors when considering where to invest their funds. Those factors are most accurately described as",
    "options": [
      {
        "label": "A",
        "text": "exchange, sales, and general."
      },
      {
        "label": "B",
        "text": "exchange, sensitivity, and growth."
      },
      {
        "label": "C",
        "text": "earnings, systematic, and governmental."
      },
      {
        "label": "D",
        "text": "environmental, social, and governance."
      }
    ],
    "answer": "D"
  },
  {
    "id": 247,
    "topic": "Client Management",
    "stem": "One of your longtime advisory clients has been critically injured in an automobile accident. The client is in the ICU at the local hospital, unable to communicate. You would be able to accept orders for the account",
    "options": [
      {
        "label": "A",
        "text": "from the client’s lawyer"
      },
      {
        "label": "B",
        "text": "from the client by getting a squeeze of the hand for a “yes”"
      },
      {
        "label": "C",
        "text": "from a person who has a written durable power of attorney over the account"
      },
      {
        "label": "D",
        "text": "from the client’s spouse"
      }
    ],
    "answer": "C"
  },
  {
    "id": 248,
    "topic": "Client Management",
    "stem": "If a client wishes the assets in her account to pass directly to specific beneficiaries after her death, her account should be titled",
    "options": [
      {
        "label": "A",
        "text": "TIC"
      },
      {
        "label": "B",
        "text": "testamentary account"
      },
      {
        "label": "C",
        "text": "JTWROS"
      },
      {
        "label": "D",
        "text": "TOD"
      }
    ],
    "answer": "D"
  },
  {
    "id": 249,
    "topic": "Client Management",
    "stem": "One of your customers has a substantial savings account at the local S&L. The customer has several grandchildren and wants the flexibility of being able to change the beneficiary allocations as their financial conditions change. You should recommend that the customer investigate the use of",
    "options": [
      {
        "label": "A",
        "text": "a durable power of attorney (POA)."
      },
      {
        "label": "B",
        "text": "a Totten trust."
      },
      {
        "label": "C",
        "text": "an irrevocable trust."
      },
      {
        "label": "D",
        "text": "a Uniform Transfers to Minors Act (UTMA) account."
      }
    ],
    "answer": "B"
  },
  {
    "id": 250,
    "topic": "Client Management",
    "stem": "One of your existing clients wishes to open a new account in the name of his spouse and enter orders on her behalf.",
    "options": [
      {
        "label": "A",
        "text": "This action is prohibited unless the customer signs a trading authorization on behalf of his spouse."
      },
      {
        "label": "B",
        "text": "This practice is ordinary and acceptable."
      },
      {
        "label": "C",
        "text": "This action is prohibited unless the spouse signs a trading authorization."
      },
      {
        "label": "D",
        "text": "The agent could be liable if the stock declines in value."
      }
    ],
    "answer": "C"
  },
  {
    "id": 251,
    "topic": "Regulations & Ethics",
    "stem": "Which of the following actions should be taken by an agent when a client decides to open an options account?",
    "options": [
      {
        "label": "A",
        "text": "Assure that an options agreement has been signed prior to the first trade taking place"
      },
      {
        "label": "B",
        "text": "Provide an options disclosure document no later than 15 days after the first trade"
      },
      {
        "label": "C",
        "text": "Review with the client the risks involved when trading options before the first options trade"
      },
      {
        "label": "D",
        "text": "Obtain approval from the designated options supervisor to open the account no later than 1 business day after the first options trade"
      }
    ],
    "answer": "C"
  },
  {
    "id": 252,
    "topic": "Regulations & Ethics",
    "stem": "Under industry rules, customers who wish to trade options must receive a copy of the options disclosure document (ODD)",
    "options": [
      {
        "label": "A",
        "text": "at or before the mailing of the confirmation representing the first options trade"
      },
      {
        "label": "B",
        "text": "at or before the mailing of the next monthly statement"
      },
      {
        "label": "C",
        "text": "within 15 days of account approval"
      },
      {
        "label": "D",
        "text": "at or before account approval"
      }
    ],
    "answer": "D"
  },
  {
    "id": 253,
    "topic": "Client Management",
    "stem": "Small corporations that satisfy certain criteria can elect not to pay income tax at the corporate level but instead pass their earnings through to their shareholders. These corporations are known as",
    "options": [
      {
        "label": "A",
        "text": "S corporations"
      },
      {
        "label": "B",
        "text": "Q corporations"
      },
      {
        "label": "C",
        "text": "R corporations"
      },
      {
        "label": "D",
        "text": "C corporations"
      }
    ],
    "answer": "A"
  },
  {
    "id": 254,
    "topic": "Client Management",
    "stem": "Which of the following individuals may NOT open a joint account?",
    "options": [
      {
        "label": "A",
        "text": "Business colleagues"
      },
      {
        "label": "B",
        "text": "Parent and a minor"
      },
      {
        "label": "C",
        "text": "Two spouses"
      },
      {
        "label": "D",
        "text": "Three sisters"
      }
    ],
    "answer": "B"
  },
  {
    "id": 255,
    "topic": "Client Management",
    "stem": "The type of trust created by a will that becomes operative at death is",
    "options": [
      {
        "label": "A",
        "text": "a Q-tip trust"
      },
      {
        "label": "B",
        "text": "a revocable trust"
      },
      {
        "label": "C",
        "text": "a living trust"
      },
      {
        "label": "D",
        "text": "a testamentary trust"
      }
    ],
    "answer": "D"
  },
  {
    "id": 256,
    "topic": "Client Management",
    "stem": "Mr. Hawkins sets up a revocable trust for the benefit of his adult daughter, Madeleine. His wife may draw from it only if she needs to. Income on the trust will be taxed to",
    "options": [
      {
        "label": "A",
        "text": "Mr. Hawkins as the donor"
      },
      {
        "label": "B",
        "text": "the trust because it is a separate legal entity"
      },
      {
        "label": "C",
        "text": "Mrs. Hawkins as the contingent beneficiary"
      },
      {
        "label": "D",
        "text": "Madeleine as the primary beneficiary"
      }
    ],
    "answer": "A"
  },
  {
    "id": 257,
    "topic": "Regulations & Ethics",
    "stem": "All of the following actions must be completed prior to customers entering their first option trade EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "receipt of a completed options agreement"
      },
      {
        "label": "B",
        "text": "delivery of the options disclosure document (ODD)"
      },
      {
        "label": "C",
        "text": "approval by a designated options supervisor"
      },
      {
        "label": "D",
        "text": "completion of the new account form"
      }
    ],
    "answer": "A"
  },
  {
    "id": 258,
    "topic": "Regulations & Ethics",
    "stem": "Which of the following would likely be stressed in a socially responsible fund?",
    "options": [
      {
        "label": "A",
        "text": "Avoidance of foreign securities"
      },
      {
        "label": "B",
        "text": "Lower than average expenses"
      },
      {
        "label": "C",
        "text": "Higher-than-average returns"
      },
      {
        "label": "D",
        "text": "Ethical and moral investing"
      }
    ],
    "answer": "D"
  },
  {
    "id": 259,
    "topic": "Investments",
    "stem": "An advantage of structuring a business operation as an S corporation rather than a C corporation would be",
    "options": [
      {
        "label": "A",
        "text": "the C corporation is limited to a maximum of 100 shareholders while no such limit exists for the S corporation"
      },
      {
        "label": "B",
        "text": "limited liability"
      },
      {
        "label": "C",
        "text": "simplicity when raising capital through a public offering"
      },
      {
        "label": "D",
        "text": "avoiding double taxation"
      }
    ],
    "answer": "D"
  },
  {
    "id": 260,
    "topic": "Client Management",
    "stem": "Obtaining all of the following complies with the regulations regarding customer identification programs (CIPs) EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "date of birth"
      },
      {
        "label": "B",
        "text": "a PO Box, instead of a physical address, if it is the primary mailing address"
      },
      {
        "label": "C",
        "text": "name"
      },
      {
        "label": "D",
        "text": "taxpayer identification number"
      }
    ],
    "answer": "B"
  },
  {
    "id": 261,
    "topic": "Investments",
    "stem": "A feature of which of the following business entities is limited liability for owners, as well as flow-through of income?",
    "options": [
      {
        "label": "A",
        "text": "Sole proprietorship"
      },
      {
        "label": "B",
        "text": "Limited partnership"
      },
      {
        "label": "C",
        "text": "C corporation"
      },
      {
        "label": "D",
        "text": "General partnership"
      }
    ],
    "answer": "B"
  },
  {
    "id": 262,
    "topic": "Regulations & Ethics",
    "stem": "Although all new accounts must be approved by a designated supervisor before any trading activity may take place, there is one type of account that must be approved by a specially qualified supervisor. That would be",
    "options": [
      {
        "label": "A",
        "text": "a discretionary account"
      },
      {
        "label": "B",
        "text": "an IRA"
      },
      {
        "label": "C",
        "text": "a margin account"
      },
      {
        "label": "D",
        "text": "an options account"
      }
    ],
    "answer": "D"
  },
  {
    "id": 263,
    "topic": "Client Management",
    "stem": "One of the ways in which a simple trust differs from a complex trust is that simple trusts",
    "options": [
      {
        "label": "A",
        "text": "may retain income."
      },
      {
        "label": "B",
        "text": "may make distributions from the corpus of the trust."
      },
      {
        "label": "C",
        "text": "must distribute their distributable net income each year."
      },
      {
        "label": "D",
        "text": "are easier to prepare."
      }
    ],
    "answer": "C"
  },
  {
    "id": 264,
    "topic": "Client Management",
    "stem": "One of your clients approaches you about setting up a trust. If your client assumes the role of grantor, what additional roles may be taken?",
    "options": [
      {
        "label": "A",
        "text": "Beneficiary"
      },
      {
        "label": "B",
        "text": "Trustee and beneficiary"
      },
      {
        "label": "C",
        "text": "As the grantor, no other roles may be taken"
      },
      {
        "label": "D",
        "text": "Trustee"
      }
    ],
    "answer": "B"
  },
  {
    "id": 265,
    "topic": "Client Management",
    "stem": "As with all investors, it is important that trusts have an investment policy statement (IPS). If the beneficiary of a trust requests that the trustee use trust assets to enter an order that is considered a prohibited transaction under the IPS, the trustee should",
    "options": [
      {
        "label": "A",
        "text": "contact the grantor of the trust."
      },
      {
        "label": "B",
        "text": "amend the IPS and process the order."
      },
      {
        "label": "C",
        "text": "follow the beneficiary’s instructions."
      },
      {
        "label": "D",
        "text": "follow the trust’s IPS and refuse the order."
      }
    ],
    "answer": "D"
  },
  {
    "id": 266,
    "topic": "Client Management",
    "stem": "Which of the following is most commonly used when the author wants to express end of life wishes?",
    "options": [
      {
        "label": "A",
        "text": "A testamentary trust"
      },
      {
        "label": "B",
        "text": "A living will"
      },
      {
        "label": "C",
        "text": "A living trust"
      },
      {
        "label": "D",
        "text": "A revocable trust"
      }
    ],
    "answer": "B"
  },
  {
    "id": 267,
    "topic": "Client Management",
    "stem": "A customer has just died. If his wife asks you what amount of federal estate tax will be imposed on the transfer of their personal property to her name, which of the following responses would be best?",
    "options": [
      {
        "label": "A",
        "text": "The amount of tax will depend on your late husband's tax bracket."
      },
      {
        "label": "B",
        "text": "The amount of tax will depend on the size of the estate to be transferred."
      },
      {
        "label": "C",
        "text": "Consult a qualified tax specialist."
      },
      {
        "label": "D",
        "text": "The amount may be prorated over the next 4 years."
      }
    ],
    "answer": "C"
  },
  {
    "id": 268,
    "topic": "Client Management",
    "stem": "A living will is used to",
    "options": [
      {
        "label": "A",
        "text": "eliminate, or at least reduce, estate taxes."
      },
      {
        "label": "B",
        "text": "ensure that the author’s assets are properly distributed after death."
      },
      {
        "label": "C",
        "text": "express the author’s end-of-life wishes."
      },
      {
        "label": "D",
        "text": "avoid the cost and time of probate."
      }
    ],
    "answer": "C"
  },
  {
    "id": 269,
    "topic": "Client Management",
    "stem": "When advisory clients wish to structure their portfolios to support companies that engage in social or environmental policies that they agree with, it is known as",
    "options": [
      {
        "label": "A",
        "text": "asset allocation"
      },
      {
        "label": "B",
        "text": "program-related investing"
      },
      {
        "label": "C",
        "text": "engineered investing"
      },
      {
        "label": "D",
        "text": "impact investing"
      }
    ],
    "answer": "D"
  },
  {
    "id": 270,
    "topic": "Regulations & Ethics",
    "stem": "In the banking industry, the term POD refers to an account similar to the TOD designation used by broker-dealers. An old, but sometimes still used term to describe this kind of account, is",
    "options": [
      {
        "label": "A",
        "text": "demand deposit account (DDA)"
      },
      {
        "label": "B",
        "text": "Totten trust"
      },
      {
        "label": "C",
        "text": "revocable trust"
      },
      {
        "label": "D",
        "text": "passbook savings account"
      }
    ],
    "answer": "B"
  },
  {
    "id": 271,
    "topic": "Client Management",
    "stem": "Which of the following documents would aid an investment adviser in its responsibility to fully understand the needs of a client when making investment recommendations?",
    "options": [
      {
        "label": "A",
        "text": "A proxy voting policy."
      },
      {
        "label": "B",
        "text": "A restricted list."
      },
      {
        "label": "C",
        "text": "A communications agreement."
      },
      {
        "label": "D",
        "text": "An investment policy statement."
      }
    ],
    "answer": "D"
  },
  {
    "id": 272,
    "topic": "Client Management",
    "stem": "A wealthy individual has set up a GRAT. Should she die during the time the trust is active, how are the remaining assets in the trust taxed?",
    "options": [
      {
        "label": "A",
        "text": "No tax is due if the grantor should die during the term of the trust."
      },
      {
        "label": "B",
        "text": "The original value plus any appreciation passes to the beneficiaries but is subject to gift tax."
      },
      {
        "label": "C",
        "text": "The original value plus any appreciation is taxed as part of the grantor’s estate."
      },
      {
        "label": "D",
        "text": "The original value plus any appreciation passes to the beneficiaries and is taxed as ordinary income."
      }
    ],
    "answer": "C"
  },
  {
    "id": 273,
    "topic": "Client Management",
    "stem": "One of the situations that investment adviser representatives may encounter is the death of a client. When that happens, orders may be accepted from",
    "options": [
      {
        "label": "A",
        "text": "the trustee in intestacy."
      },
      {
        "label": "B",
        "text": "an individual with a durable power of attorney."
      },
      {
        "label": "C",
        "text": "the deceased client’s spouse."
      },
      {
        "label": "D",
        "text": "the deceased client’s children."
      }
    ],
    "answer": "A"
  },
  {
    "id": 274,
    "topic": "Client Management",
    "stem": "When a will calls for property to be distributed per stirpes, it means that",
    "options": [
      {
        "label": "A",
        "text": "the property is divided into as many equal shares as there are surviving children of the designated ancestor and deceased children who left surviving descendants"
      },
      {
        "label": "B",
        "text": "the property is divided into as many equal shares as there are surviving children and grandchildren of the designated ancestor"
      },
      {
        "label": "C",
        "text": "all living descendants of the ancestor receive equal shares in the property remaining after all estate expenses are paid"
      },
      {
        "label": "D",
        "text": "the property is divided into as many equal shares as there are surviving children of the designated ancestor, with nothing going to surviving descendants of deceased children"
      }
    ],
    "answer": "A"
  },
  {
    "id": 275,
    "topic": "Client Management",
    "stem": "A major benefit of a revocable trust is that",
    "options": [
      {
        "label": "A",
        "text": "the settlor cannot also be the beneficiary."
      },
      {
        "label": "B",
        "text": "the grantor retains control of the assets."
      },
      {
        "label": "C",
        "text": "the grantor saves on income taxes."
      },
      {
        "label": "D",
        "text": "the assets are not included in the grantor’s estate."
      }
    ],
    "answer": "B"
  },
  {
    "id": 276,
    "topic": "Regulations & Ethics",
    "stem": "An investment adviser using an insurance approach to capital needs analysis would",
    "options": [
      {
        "label": "A",
        "text": "only invest in securities guaranteed by the FDIC"
      },
      {
        "label": "B",
        "text": "select securities based upon the customer's investment experience"
      },
      {
        "label": "C",
        "text": "invest exclusively in insured securities such as insured municipal bonds or Ginnie Maes"
      },
      {
        "label": "D",
        "text": "determine the insurance coverage needed to complete the customer's financial objective should the customer die before the objective is met"
      }
    ],
    "answer": "D"
  },
  {
    "id": 277,
    "topic": "Investments",
    "stem": "If a customer's chief concern is to shelter as much of his portfolio earnings from tax as possible, which of the following securities would be most suitable?",
    "options": [
      {
        "label": "A",
        "text": "Municipal GOs"
      },
      {
        "label": "B",
        "text": "Treasury receipts"
      },
      {
        "label": "C",
        "text": "Money market instruments"
      },
      {
        "label": "D",
        "text": "High-yield bonds"
      }
    ],
    "answer": "A"
  },
  {
    "id": 278,
    "topic": "Client Management",
    "stem": "Many investment advisers prepare an investment policy statement (IPS) when counseling their clients. Which of the following should least likely be included as a constraint in an investment policy statement?",
    "options": [
      {
        "label": "A",
        "text": "Asset classes the client specifically forbids or limits based on past experience"
      },
      {
        "label": "B",
        "text": "Constraints put on investment activities by regulatory agencies"
      },
      {
        "label": "C",
        "text": "How the funds are spent after being withdrawn from the portfolio"
      },
      {
        "label": "D",
        "text": "Any unique needs or preferences an investor may have"
      }
    ],
    "answer": "C"
  },
  {
    "id": 279,
    "topic": "Client Management",
    "stem": "Parker and Mary have recently divorced. For Mary to receive Social Security benefits based on Parker's earnings, which of the following conditions must exist?",
    "options": [
      {
        "label": "A",
        "text": "Parker must already be at full retirement age."
      },
      {
        "label": "B",
        "text": "Mary must have worked at least 40 quarters to be eligible for benefits."
      },
      {
        "label": "C",
        "text": "The marriage must have lasted at least 10 years."
      },
      {
        "label": "D",
        "text": "Parker must not be remarried."
      }
    ],
    "answer": "C"
  },
  {
    "id": 280,
    "topic": "Investments",
    "stem": "Liquidity risk is the risk that when an investor wishes to dispose of an investment, no one will be willing to buy it, or that a very large purchase or sale would not be possible at the current price. With that in mind, which of the following would likely have the lowest degree of exposure to liquidity risk?",
    "options": [
      {
        "label": "A",
        "text": "Money market mutual funds"
      },
      {
        "label": "B",
        "text": "Investment-grade municipal bonds"
      },
      {
        "label": "C",
        "text": "REITs"
      },
      {
        "label": "D",
        "text": "RELPs"
      }
    ],
    "answer": "A"
  },
  {
    "id": 281,
    "topic": "Investments",
    "stem": "A client with 25 years until retirement should invest primarily in",
    "options": [
      {
        "label": "A",
        "text": "private placements"
      },
      {
        "label": "B",
        "text": "preferred stocks"
      },
      {
        "label": "C",
        "text": "bonds"
      },
      {
        "label": "D",
        "text": "common stocks"
      }
    ],
    "answer": "D"
  },
  {
    "id": 282,
    "topic": "Client Management",
    "stem": "A married couple in their early 50s saving for retirement would most likely have which of the following objectives?",
    "options": [
      {
        "label": "A",
        "text": "Moderate risk, moderate safety, low liquidity"
      },
      {
        "label": "B",
        "text": "High risk, moderate safety, low liquidity"
      },
      {
        "label": "C",
        "text": "Low risk, high safety, high liquidity"
      },
      {
        "label": "D",
        "text": "Moderate risk, low safety, high liquidity"
      }
    ],
    "answer": "A"
  },
  {
    "id": 283,
    "topic": "Client Management",
    "stem": "An investor has just received an inheritance of $100,000 and has decided to use the money to buy a new home. Because it will take time to decide where to buy, it is expected that the purchase will not be made for another 6–9 months. If this investor placed the money into a broad market index ETF, the primary risk taken would be",
    "options": [
      {
        "label": "A",
        "text": "market risk"
      },
      {
        "label": "B",
        "text": "unsystematic risk"
      },
      {
        "label": "C",
        "text": "business risk"
      },
      {
        "label": "D",
        "text": "interest rate risk"
      }
    ],
    "answer": "A"
  },
  {
    "id": 284,
    "topic": "Investments",
    "stem": "An elderly widow with no independent income wishes to invest the proceeds from her recently deceased husband's life insurance. Which of the following would be the most suitable recommendation?",
    "options": [
      {
        "label": "A",
        "text": "Municipal bonds"
      },
      {
        "label": "B",
        "text": "Call options"
      },
      {
        "label": "C",
        "text": "Oil and gas exploration program that you know is going to strike"
      },
      {
        "label": "D",
        "text": "High-grade corporate bond mutual fund"
      }
    ],
    "answer": "D"
  },
  {
    "id": 285,
    "topic": "Investments",
    "stem": "Which of the following situations would most likely cause an individual's application for a disability income insurance policy to be denied?",
    "options": [
      {
        "label": "A",
        "text": "Being over 50 years of age"
      },
      {
        "label": "B",
        "text": "Working in a hazardous occupation"
      },
      {
        "label": "C",
        "text": "BMI over 26"
      },
      {
        "label": "D",
        "text": "Type 2 diabetes"
      }
    ],
    "answer": "B"
  },
  {
    "id": 286,
    "topic": "Regulations & Ethics",
    "stem": "Tamika is an investment adviser representative with Financial Engineers, LLC, a covered investment adviser. The firm uses an investment policy statement to help design financial plans for their clients. One of Tamika's current clients plans to purchase a new boat 7 months from now. When using the IPS, this would be considered",
    "options": [
      {
        "label": "A",
        "text": "a capital need"
      },
      {
        "label": "B",
        "text": "an investment goal"
      },
      {
        "label": "C",
        "text": "an investment constraint"
      },
      {
        "label": "D",
        "text": "a financial objective"
      }
    ],
    "answer": "C"
  },
  {
    "id": 287,
    "topic": "Economics",
    "stem": "An investor who purchases stock in two technology companies with high projected earnings and growth potential but little performance history is considered",
    "options": [
      {
        "label": "A",
        "text": "a conservative investor"
      },
      {
        "label": "B",
        "text": "an aggressive investor"
      },
      {
        "label": "C",
        "text": "a defensive investor"
      },
      {
        "label": "D",
        "text": "a passive investor"
      }
    ],
    "answer": "B"
  },
  {
    "id": 288,
    "topic": "Client Management",
    "stem": "A benefit of waiting until the age of 70 to claim Social Security benefits is that",
    "options": [
      {
        "label": "A",
        "text": "the income tax rate is reduced once the claimant reaches 70."
      },
      {
        "label": "B",
        "text": "benefits are increased by 8% for each year from the full retirement age."
      },
      {
        "label": "C",
        "text": "a higher percentage of the monthly benefit is exempt from income taxes."
      },
      {
        "label": "D",
        "text": "Medicare benefits are increased."
      }
    ],
    "answer": "B"
  },
  {
    "id": 289,
    "topic": "Client Management",
    "stem": "Which of the following is least likely to be considered an investment constraint when preparing an investment policy statement?",
    "options": [
      {
        "label": "A",
        "text": "Tax concerns"
      },
      {
        "label": "B",
        "text": "Legal and regulatory factors"
      },
      {
        "label": "C",
        "text": "Risk tolerance"
      },
      {
        "label": "D",
        "text": "Liquidity needs"
      }
    ],
    "answer": "C"
  },
  {
    "id": 290,
    "topic": "Client Management",
    "stem": "In projecting future cash requirements, one of the tools is a capital needs analysis. When doing one, all of the following would be considered capital needs EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "a $100,000 loan for law school with a due date in 10 years"
      },
      {
        "label": "B",
        "text": "rolling over a 401(k) into an IRA"
      },
      {
        "label": "C",
        "text": "a home equity loan with a $15,000 balance"
      },
      {
        "label": "D",
        "text": "a $20,000 loan for undergraduate school with a due date in 6 years"
      }
    ],
    "answer": "B"
  },
  {
    "id": 291,
    "topic": "Client Management",
    "stem": "Years ago, following your advice, a client opened a 529 Plan to save for their son's college education. The child is now about 3 years from beginning his freshman year. The client, believing that the stock market is currently undervalued, wishes to reallocate the plan assets so that most of the funds are in a broad stock market index portfolio. At this time, your advice would probably be against this allocation because of",
    "options": [
      {
        "label": "A",
        "text": "interest rate risk"
      },
      {
        "label": "B",
        "text": "liquidity risk"
      },
      {
        "label": "C",
        "text": "market risk"
      },
      {
        "label": "D",
        "text": "business risk"
      }
    ],
    "answer": "C"
  },
  {
    "id": 292,
    "topic": "Investments",
    "stem": "For a trust account not seeking appreciation, which of the following would be recommended?",
    "options": [
      {
        "label": "A",
        "text": "Large-cap common and preferred stocks"
      },
      {
        "label": "B",
        "text": "Common stock, preferred stock, and debentures"
      },
      {
        "label": "C",
        "text": "Highly rated, fixed-income securities"
      },
      {
        "label": "D",
        "text": "Common stock in small, highly profitable companies"
      }
    ],
    "answer": "C"
  },
  {
    "id": 293,
    "topic": "Client Management",
    "stem": "Your married customers are both 42 years old, have 2 children ages 14 and 12, and have spent the past 10 years accumulating money to provide for their children's education. Their oldest child will enter college in 4 years, and the customers are very cautious investors. If they need a safe investment that provides regular income to help them meet tuition payments, which of the following mutual funds is the most suitable for these customers?",
    "options": [
      {
        "label": "A",
        "text": "ATF Overseas Opportunities Fund"
      },
      {
        "label": "B",
        "text": "RST Balanced Fund"
      },
      {
        "label": "C",
        "text": "LMN Investment-Grade Bond Fund"
      },
      {
        "label": "D",
        "text": "ABC Stock Index Fund"
      }
    ],
    "answer": "C"
  },
  {
    "id": 294,
    "topic": "Client Management",
    "stem": "If your clients, spouses both age 50, are interested in long-term growth and are willing to accept a moderate amount of risk, you should recommend",
    "options": [
      {
        "label": "A",
        "text": "a large-cap stock fund"
      },
      {
        "label": "B",
        "text": "a municipal bond fund"
      },
      {
        "label": "C",
        "text": "an equity\\/income fund"
      },
      {
        "label": "D",
        "text": "a money market fund"
      }
    ],
    "answer": "A"
  },
  {
    "id": 295,
    "topic": "Investments",
    "stem": "Your elderly client has $10,000 to invest and seeks preservation of capital and a moderate income stream. If she has never invested in mutual funds before and all of her savings are in bank CDs and saving accounts, you should recommend",
    "options": [
      {
        "label": "A",
        "text": "a government bond fund"
      },
      {
        "label": "B",
        "text": "a T-bill"
      },
      {
        "label": "C",
        "text": "a money market fund"
      },
      {
        "label": "D",
        "text": "a tax-exempt bond fund"
      }
    ],
    "answer": "C"
  },
  {
    "id": 296,
    "topic": "Investments",
    "stem": "You are doing an investment plan for a new client, age 55, who plans to retire at age 70. The client is somewhat risk averse and wants to preserve capital while at the same time not falling prey to possible inflation. Which of the following portfolios would probably be most suitable?",
    "options": [
      {
        "label": "A",
        "text": "60% high-quality bonds; 30% large-cap stocks; 10% cash equivalents"
      },
      {
        "label": "B",
        "text": "90% large-cap stocks; 10% high-quality bonds"
      },
      {
        "label": "C",
        "text": "90% high-quality bonds; 10% large-cap stocks"
      },
      {
        "label": "D",
        "text": "40% high-yield bonds; 60% large-cap stocks"
      }
    ],
    "answer": "A"
  },
  {
    "id": 297,
    "topic": "Regulations & Ethics",
    "stem": "An investment adviser representative has a 78-year-old prospect living on $26,400 per year from Social Security plus investment income. The individual's net worth is $141, 000 including the equity in her primary residence. Her net worth was higher until recently, but the aggressive fund she owns in the KAPCO family of funds is down over $20,000 in value. Which of the following would you recommend to her?",
    "options": [
      {
        "label": "A",
        "text": "Sell her fund shares and reinvest in a vehicle offering her deferred accumulation"
      },
      {
        "label": "B",
        "text": "Liquidate the fund shares and put the proceeds in a bank CD"
      },
      {
        "label": "C",
        "text": "Invest in a municipal bond fund"
      },
      {
        "label": "D",
        "text": "Switch to a more conservative fund in the same family of funds"
      }
    ],
    "answer": "D"
  },
  {
    "id": 298,
    "topic": "Investments",
    "stem": "An investor concerned about preservation of capital would be most apt to purchase",
    "options": [
      {
        "label": "A",
        "text": "investment-grade corporate bonds"
      },
      {
        "label": "B",
        "text": "common stock"
      },
      {
        "label": "C",
        "text": "warrants"
      },
      {
        "label": "D",
        "text": "call options"
      }
    ],
    "answer": "A"
  },
  {
    "id": 299,
    "topic": "Client Management",
    "stem": "Your customer, age 60, is retired and living at home with a fully paid-off mortgage. Her portfolio contains growth stocks and high-quality bonds, and she is a longtime investor and comfortable with moderate risk. Her objective is a moderate level of current income to supplement her corporate pension plan distributions and the earnings from her IRA. Which of the following mutual funds is the most suitable for this customer?",
    "options": [
      {
        "label": "A",
        "text": "ABC Equity Income Fund"
      },
      {
        "label": "B",
        "text": "QRS Capital Appreciation Fund"
      },
      {
        "label": "C",
        "text": "XYZ Biotechnology Fund"
      },
      {
        "label": "D",
        "text": "LMN Stock Index Fund"
      }
    ],
    "answer": "A"
  },
  {
    "id": 300,
    "topic": "Client Management",
    "stem": "If a customer is in the 15% federal income tax bracket and his main investment objective is current income, which of the following securities should the agent recommend?",
    "options": [
      {
        "label": "A",
        "text": "Zero-coupon bond."
      },
      {
        "label": "B",
        "text": "City of Milwaukee GO bond."
      },
      {
        "label": "C",
        "text": "U.S. government bond."
      },
      {
        "label": "D",
        "text": "Investment-grade corporate bond."
      }
    ],
    "answer": "D"
  },
  {
    "id": 301,
    "topic": "Regulations & Ethics",
    "stem": "Under the Uniform Securities Act, a person whose business model is selling reports on a subscription basis concerning specific securities to investors based on their individual objectives will be defined as",
    "options": [
      {
        "label": "A",
        "text": "a broker-dealer"
      },
      {
        "label": "B",
        "text": "an investment adviser"
      },
      {
        "label": "C",
        "text": "a journalist"
      },
      {
        "label": "D",
        "text": "an agent"
      }
    ],
    "answer": "B"
  },
  {
    "id": 302,
    "topic": "Investments",
    "stem": "There are waivers from the Series 65 exam requirement for certain professional designations. Among those qualifying for the waiver are individuals who are",
    "options": [
      {
        "label": "A",
        "text": "MBAs."
      },
      {
        "label": "B",
        "text": "CLUs."
      },
      {
        "label": "C",
        "text": "CPAs."
      },
      {
        "label": "D",
        "text": "CFP®s."
      }
    ],
    "answer": "D"
  },
  {
    "id": 303,
    "topic": "Regulations & Ethics",
    "stem": "The responsibility for administering the Investment Advisers Act of 1940 lies with",
    "options": [
      {
        "label": "A",
        "text": "FINRA"
      },
      {
        "label": "B",
        "text": "the Administrator"
      },
      {
        "label": "C",
        "text": "the Investment Advisers Association (IAA)"
      },
      {
        "label": "D",
        "text": "the SEC"
      }
    ],
    "answer": "D"
  },
  {
    "id": 304,
    "topic": "Regulations & Ethics",
    "stem": "Under the Investment Advisers Act of 1940, which of the following is TRUE about the use of the term \"investment counsel\" by investment advisers?",
    "options": [
      {
        "label": "A",
        "text": "Advisers may use the term without restriction as long as they are registered."
      },
      {
        "label": "B",
        "text": "The use of the term is prohibited under any circumstances."
      },
      {
        "label": "C",
        "text": "Advisers may use the term only if their principal business is acting as an investment adviser and a substantial part of their business consists of providing continuous advice based on a client's individual needs."
      },
      {
        "label": "D",
        "text": "Advisers may use the term only if they are attorneys."
      }
    ],
    "answer": "C"
  },
  {
    "id": 305,
    "topic": "Client Management",
    "stem": "Which of the following investment advisers would be permitted to use the term \"investment counsel\"?",
    "options": [
      {
        "label": "A",
        "text": "A professional providing a market timing service with an annual subscription fee of $995, with this service attempting to maximize profits by suggesting entry and exit points for over 100 listed stocks"
      },
      {
        "label": "B",
        "text": "An investment adviser who has been admitted to the bar in the state in which the firm's principal office is located"
      },
      {
        "label": "C",
        "text": "A financial planner offering a wide range of services to his clients, including tax planning, estate planning, insurance planning, and investment advice"
      },
      {
        "label": "D",
        "text": "A firm whose exclusive business is placing clients' assets into model portfolios"
      }
    ],
    "answer": "D"
  },
  {
    "id": 306,
    "topic": "Regulations & Ethics",
    "stem": "Which of the following is NOT a person as defined by the Uniform Securities Act?",
    "options": [
      {
        "label": "A",
        "text": "XYZ Dry Cleaners, Inc., whose shareholders all work on the premises and also offer financial advice to customers who request it."
      },
      {
        "label": "B",
        "text": "A small unincorporated investment club."
      },
      {
        "label": "C",
        "text": "A child prodigy for whom his mother, as custodian, opened an account at a major securities firm."
      },
      {
        "label": "D",
        "text": "Guelph, a small city outside of Toronto, Ontario, that maintains an investment account at a brokerage house to invest surplus funds."
      }
    ],
    "answer": "C"
  },
  {
    "id": 307,
    "topic": "Regulations & Ethics",
    "stem": "The term \"investment counsel\" can be used by investment advisers",
    "options": [
      {
        "label": "A",
        "text": "who are registered with the SEC under the Investment Advisers Act of 1940"
      },
      {
        "label": "B",
        "text": "who are also attorneys"
      },
      {
        "label": "C",
        "text": "who are also registered as broker-dealers"
      },
      {
        "label": "D",
        "text": "with a primary business of rendering investment advice"
      }
    ],
    "answer": "D"
  },
  {
    "id": 308,
    "topic": "Regulations & Ethics",
    "stem": "Which of the following is NOT included in Form ADV Part 2A?",
    "options": [
      {
        "label": "A",
        "text": "Types of investments made by the adviser"
      },
      {
        "label": "B",
        "text": "A description of how the adviser is compensated"
      },
      {
        "label": "C",
        "text": "Investment policy of the adviser"
      },
      {
        "label": "D",
        "text": "States in which the investment adviser is registered or intends to register"
      }
    ],
    "answer": "D"
  },
  {
    "id": 309,
    "topic": "Regulations & Ethics",
    "stem": "The chief compliance officer (CCO) of a registered investment adviser would generally not have responsibility for the actions of",
    "options": [
      {
        "label": "A",
        "text": "ministerial personnel of the firm."
      },
      {
        "label": "B",
        "text": "an investment adviser representative of the firm."
      },
      {
        "label": "C",
        "text": "an agent registered with an affiliated broker-dealer."
      },
      {
        "label": "D",
        "text": "supervisory personnel of the firm."
      }
    ],
    "answer": "C"
  },
  {
    "id": 310,
    "topic": "Regulations & Ethics",
    "stem": "A federal covered registered investment adviser who receives compensation for advice and whose business is primarily as an investment adviser may describe its business as investment counsel if",
    "options": [
      {
        "label": "A",
        "text": "a substantial part of his business is providing investment supervisory services"
      },
      {
        "label": "B",
        "text": "it maintains custody of customer funds and\\/or securities"
      },
      {
        "label": "C",
        "text": "it maintains its registration by filing an updating amendment to its Form ADV annually"
      },
      {
        "label": "D",
        "text": "it receives SEC approval to use the definition"
      }
    ],
    "answer": "A"
  },
  {
    "id": 311,
    "topic": "Regulations & Ethics",
    "stem": "According to the Investment Advisers Act of 1940, the SEC must either grant investment adviser registration or begin proceedings to determine whether registration should be denied within how many days of filing?",
    "options": [
      {
        "label": "A",
        "text": "45"
      },
      {
        "label": "B",
        "text": "90"
      },
      {
        "label": "C",
        "text": "60"
      },
      {
        "label": "D",
        "text": "30"
      }
    ],
    "answer": "A"
  },
  {
    "id": 312,
    "topic": "Regulations & Ethics",
    "stem": "Included in the Investment Advisers Act of 1940 are a number of different recordkeeping requirements. Wealth Preservation Specialists is a covered adviser that is organized as a partnership. If the firm were to dissolve, partnership agreements must be kept for",
    "options": [
      {
        "label": "A",
        "text": "3 years after the dissolution"
      },
      {
        "label": "B",
        "text": "5 years after the dissolution"
      },
      {
        "label": "C",
        "text": "5 years from the date of organization"
      },
      {
        "label": "D",
        "text": "the lifetime of the firm"
      }
    ],
    "answer": "A"
  },
  {
    "id": 313,
    "topic": "Regulations & Ethics",
    "stem": "Registration as an investment adviser is required for any firm in the business of giving advice on the purchase of",
    "options": [
      {
        "label": "A",
        "text": "gold coins"
      },
      {
        "label": "B",
        "text": "apartments undergoing a conversion to condominiums"
      },
      {
        "label": "C",
        "text": "convertible bonds"
      },
      {
        "label": "D",
        "text": "rare convertible automobiles"
      }
    ],
    "answer": "C"
  },
  {
    "id": 314,
    "topic": "Regulations & Ethics",
    "stem": "John Law is the owner of Mississippi Advisory Services (MAS), an independent financial planning organization. Law is registered as an investment adviser representative of SSC Securities and Investments, registered as a broker-dealer, and an investment adviser with the SEC. Supervision over Law's advisory activities is the responsibility of",
    "options": [
      {
        "label": "A",
        "text": "MAS’s CCO."
      },
      {
        "label": "B",
        "text": "SSC’s CCO."
      },
      {
        "label": "C",
        "text": "John Law."
      },
      {
        "label": "D",
        "text": "the SEC."
      }
    ],
    "answer": "B"
  },
  {
    "id": 315,
    "topic": "Regulations & Ethics",
    "stem": "In which of the following cases could revocation of the registration of an IAR lead to disciplinary action against the investment adviser employing that individual?",
    "options": [
      {
        "label": "A",
        "text": "The IAR was found guilty of first degree murder."
      },
      {
        "label": "B",
        "text": "The IAR failed to make full disclosure of a previous felony conviction on the Form U4."
      },
      {
        "label": "C",
        "text": "The firm supplied the IAR with a copy of its Code of Ethics and administered regular training on its contents."
      },
      {
        "label": "D",
        "text": "The firm was found guilty of failure to supervise."
      }
    ],
    "answer": "D"
  },
  {
    "id": 316,
    "topic": "Regulations & Ethics",
    "stem": "Leslie is an IAR with Financial Visions (FV), a federal covered investment adviser. Leslie operates Innovative Financial Solutions (IFS), a separate financial planning company with its own office in State W. Should Leslie be found guilty of fraudulent business activities, FV would",
    "options": [
      {
        "label": "A",
        "text": "be immune from State W’s Administrator’s jurisdiction because it is a federal covered adviser."
      },
      {
        "label": "B",
        "text": "claim that IFS is a separate entity over which FV has no responsibility."
      },
      {
        "label": "C",
        "text": "be subject to possible disciplinary action brought by the State W Administrator if it could be shown that FV failed to supervise Leslie’s activities."
      },
      {
        "label": "D",
        "text": "possibly have its State W registration suspended."
      }
    ],
    "answer": "C"
  },
  {
    "id": 317,
    "topic": "Regulations & Ethics",
    "stem": "Which of the following statements regarding the SEC's power to revoke the registration of an investment adviser is TRUE?",
    "options": [
      {
        "label": "A",
        "text": "If it is determined that an investment adviser is insolvent, the SEC may revoke the registration."
      },
      {
        "label": "B",
        "text": "An investment adviser receiving substantial prepayment of fees from 50% of its clients that fails to include a copy of its balance sheet in its brochure delivered to all clients would give the SEC cause for beginning revocation proceedings."
      },
      {
        "label": "C",
        "text": "Revocation would occur, with appropriate notice, when a firm’s annual updating amendment was received by the SEC 120 days after the end of the registrant’s fiscal year."
      },
      {
        "label": "D",
        "text": "Failure to adequately supervise a person associated with the adviser could be cause for the SEC to revoke the firm’s registration."
      }
    ],
    "answer": "D"
  },
  {
    "id": 318,
    "topic": "Regulations & Ethics",
    "stem": "The Investment Advisers Act of 1940 requires every registered investment adviser to have a chief compliance officer (CCO). This individual would be responsible for ensuring compliance with the firm's Code of Ethics by all of these EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "clerical and ministerial employees of the firm"
      },
      {
        "label": "B",
        "text": "investment adviser representatives employed by the firm"
      },
      {
        "label": "C",
        "text": "a nonaffiliated broker-dealer through whom the majority of the firms trades are executed"
      },
      {
        "label": "D",
        "text": "investment adviser representatives who are independent contractors"
      }
    ],
    "answer": "C"
  },
  {
    "id": 319,
    "topic": "Client Management",
    "stem": "Under the Uniform Securities Act, which of the following is an investment adviser?",
    "options": [
      {
        "label": "A",
        "text": "Tom writes a newspaper column that analyzes and recommends securities."
      },
      {
        "label": "B",
        "text": "Jane advises customers regarding the value of gold and silver coins."
      },
      {
        "label": "C",
        "text": "The Trust Department of ABC Bank provides investment advice to its clients."
      },
      {
        "label": "D",
        "text": "Jill is an attorney specializing in estate planning who, as a side job, structures portfolios for the beneficiaries of her deceased clients at a reduced fee."
      }
    ],
    "answer": "D"
  },
  {
    "id": 320,
    "topic": "Regulations & Ethics",
    "stem": "To register a sole proprietorship as an investment adviser in a state, the application for initial registration (Form ADV) must be filed with the appropriate party. This application must include all of the following except",
    "options": [
      {
        "label": "A",
        "text": "the appropriate fees."
      },
      {
        "label": "B",
        "text": "a consent to service of process."
      },
      {
        "label": "C",
        "text": "any information to be furnished or disseminated to any client or prospective client."
      },
      {
        "label": "D",
        "text": "a copy of the articles of incorporation for the business."
      }
    ],
    "answer": "D"
  },
  {
    "id": 321,
    "topic": "Regulations & Ethics",
    "stem": "Under the Uniform Securities Act, which of the following qualifies as an investment adviser representative?",
    "options": [
      {
        "label": "A",
        "text": "An agent who offers incidental advice on securities as part of his sales commissions"
      },
      {
        "label": "B",
        "text": "An individual who renders fee-based advice on precious metals"
      },
      {
        "label": "C",
        "text": "A solicitor for an investment advisory firm who is paid a fee for his services"
      },
      {
        "label": "D",
        "text": "An employee, although highly skilled in evaluating securities, solely performs administrative or clerical functions for an investment adviser"
      }
    ],
    "answer": "C"
  },
  {
    "id": 322,
    "topic": "Regulations & Ethics",
    "stem": "The final responsibility for ensuring that investment adviser representatives are adequately supervised is that of",
    "options": [
      {
        "label": "A",
        "text": "the managing principal."
      },
      {
        "label": "B",
        "text": "the Administrator."
      },
      {
        "label": "C",
        "text": "the chief compliance officer."
      },
      {
        "label": "D",
        "text": "each investment adviser representative’s immediate supervisor."
      }
    ],
    "answer": "C"
  },
  {
    "id": 323,
    "topic": "Regulations & Ethics",
    "stem": "Under the Uniform Securities Act, if no denial or proceedings are pending, when does an investment adviser registration become effective?",
    "options": [
      {
        "label": "A",
        "text": "When the Administrator so orders, but not to exceed 90 days"
      },
      {
        "label": "B",
        "text": "When the Administrator so orders, but not to exceed 30 days"
      },
      {
        "label": "C",
        "text": "No sooner than 15 days"
      },
      {
        "label": "D",
        "text": "60 days after application or an amendment is filed"
      }
    ],
    "answer": "B"
  },
  {
    "id": 324,
    "topic": "Regulations & Ethics",
    "stem": "Kapco Advisers, a federal covered investment adviser operating on a calendar-year basis, published a list of recommended securities in January 2015. A copy of this must be maintained until at least",
    "options": [
      {
        "label": "A",
        "text": "January 31, 2020"
      },
      {
        "label": "B",
        "text": "January 31, 2017"
      },
      {
        "label": "C",
        "text": "December 31, 2017"
      },
      {
        "label": "D",
        "text": "December 31, 2020"
      }
    ],
    "answer": "D"
  },
  {
    "id": 325,
    "topic": "Regulations & Ethics",
    "stem": "The primary responsibility for supervising the activities of an investment adviser representative who is affiliated with a federal covered investment adviser lies with",
    "options": [
      {
        "label": "A",
        "text": "the investment adviser representative"
      },
      {
        "label": "B",
        "text": "the investment adviser the IAR represents"
      },
      {
        "label": "C",
        "text": "the SEC"
      },
      {
        "label": "D",
        "text": "the Administrator"
      }
    ],
    "answer": "B"
  },
  {
    "id": 326,
    "topic": "Client Management",
    "stem": "Which of the following does NOT meet the compensation test for defining investment advisers under SEC Release 1A-1092?",
    "options": [
      {
        "label": "A",
        "text": "An insurance agent sells a life insurance policy and receives a commission on that policy. During the sale of the insurance policy, the agent provides some securities investment advice"
      },
      {
        "label": "B",
        "text": "Your next-door neighbor recommends the purchase of a certain security from his broker, which you eventually do"
      },
      {
        "label": "C",
        "text": "Subscription payments received by a publisher of a newsletter providing impersonal securities-related advice"
      },
      {
        "label": "D",
        "text": "A real estate agent advertises that she will give free advice regarding investing the proceeds from the sale of any home she lists"
      }
    ],
    "answer": "B"
  },
  {
    "id": 327,
    "topic": "Regulations & Ethics",
    "stem": "A person is excluded from the definition of investment adviser under the Investment Advisers Act of 1940 if the investment advice and reports are restricted to",
    "options": [
      {
        "label": "A",
        "text": "securities listed on a national stock exchange"
      },
      {
        "label": "B",
        "text": "U.S. government securities"
      },
      {
        "label": "C",
        "text": "bank and insurance company securities"
      },
      {
        "label": "D",
        "text": "foreign securities"
      }
    ],
    "answer": "B"
  },
  {
    "id": 328,
    "topic": "Regulations & Ethics",
    "stem": "Which of the following is required to register in a state under the Uniform Securities Act?",
    "options": [
      {
        "label": "A",
        "text": "ABC State Bank, which provides investment advice in its branches throughout the state"
      },
      {
        "label": "B",
        "text": "A broker-dealer who has no place of business in the state and whose only clients in the state are limited to insurance companies, banks, and broker-dealers"
      },
      {
        "label": "C",
        "text": "An investment adviser who has a place of business in the state and whose only clients in the state are insurance companies, banks, and broker-dealers"
      },
      {
        "label": "D",
        "text": "An investment adviser who has no place of business in the state and communicates with only 5 advisory clients in the state for the year"
      }
    ],
    "answer": "C"
  },
  {
    "id": 329,
    "topic": "Client Management",
    "stem": "Written policies and procedures reasonably designed to safeguard customer information from cyber security threats would include all of the following EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "maintaining the minimum required cybersecurity insurance coverage."
      },
      {
        "label": "B",
        "text": "encrypting personally identifiable information."
      },
      {
        "label": "C",
        "text": "conducting periodic risk assessments."
      },
      {
        "label": "D",
        "text": "implementing a firewall."
      }
    ],
    "answer": "A"
  },
  {
    "id": 330,
    "topic": "Regulations & Ethics",
    "stem": "The USA provides either an exclusion from the definition or an exemption from registration as an investment adviser for certain persons. Which of the following would be required to register?",
    "options": [
      {
        "label": "A",
        "text": "A bank trust officer with less than $250 million in assets under management"
      },
      {
        "label": "B",
        "text": "A teacher who teaches a course in the local high school on consumer economics"
      },
      {
        "label": "C",
        "text": "A CFP® who provides a full range of financial planning to clients on a fee-only basis"
      },
      {
        "label": "D",
        "text": "An engineer employed by an oil company selling limited partnership interests to public investors who provides estimates of recoverable reserves"
      }
    ],
    "answer": "C"
  },
  {
    "id": 331,
    "topic": "Regulations & Ethics",
    "stem": "Under the SEC Release IA-1092, who of the following would be considered to be in the business of rendering investment advice?",
    "options": [
      {
        "label": "A",
        "text": "A financial planner who charges no fee for developing a financial plan, but takes commissions on recommended trades"
      },
      {
        "label": "B",
        "text": "An accountant who provides investment advice to clients as an incidental part of the business"
      },
      {
        "label": "C",
        "text": "An agent who receives no separate compensation for investment advice but who takes commissions on recommended trades"
      },
      {
        "label": "D",
        "text": "An individual who provides investment advice to family members, but receives no compensation"
      }
    ],
    "answer": "A"
  },
  {
    "id": 332,
    "topic": "Regulations & Ethics",
    "stem": "Under the Uniform Securities Act, which of the following statements relating to the registration requirements of investment advisers is TRUE?",
    "options": [
      {
        "label": "A",
        "text": "A registration becomes effective at noon, 30 days after the application has been filed, providing the registration is not in the process of denial."
      },
      {
        "label": "B",
        "text": "If an amendment to the registration is subsequently filed, the registration becomes effective 15 days after the amendment is filed."
      },
      {
        "label": "C",
        "text": "Registrations of securities professionals expire 1 year after their effective date, unless renewed."
      },
      {
        "label": "D",
        "text": "A registration is automatically effective at noon, 30 days after the application has been filed."
      }
    ],
    "answer": "A"
  },
  {
    "id": 333,
    "topic": "Regulations & Ethics",
    "stem": "After diligently studying the Kaplan course, Greg Gossett completed the series of exams for the Certified Financial Planner (CFP®) designation. Now, Greg would like to expand his horizons by becoming a registered investment adviser. In order to do so, Greg would have to do all of the following EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "pay a filing fee"
      },
      {
        "label": "B",
        "text": "pass the Series 65 examination"
      },
      {
        "label": "C",
        "text": "provide a consent to service of process"
      },
      {
        "label": "D",
        "text": "submit a Form ADV"
      }
    ],
    "answer": "B"
  },
  {
    "id": 334,
    "topic": "Regulations & Ethics",
    "stem": "A consent to service of process required by an Administrator is",
    "options": [
      {
        "label": "A",
        "text": "a formal statement declaring that an investment adviser will comply with all advertising requirements of the USA"
      },
      {
        "label": "B",
        "text": "an agreement to perform all services and duties that the Uniform Securities Act (USA) requires of those individuals covered by the USA"
      },
      {
        "label": "C",
        "text": "an agreement whereby a registrant will be bound by any legal action or subpoena served on the Administrator as if it had been served on the registrant"
      },
      {
        "label": "D",
        "text": "a legal procedure that authorizes the Administrator to issue injunctions"
      }
    ],
    "answer": "D"
  },
  {
    "id": 335,
    "topic": "Regulations & Ethics",
    "stem": "When filing the consent to service of process, which of the following is TRUE?",
    "options": [
      {
        "label": "A",
        "text": "It must be filed annually on the dates specified by the Administrator."
      },
      {
        "label": "B",
        "text": "It is not required of investment adviser representatives, only investment advisers."
      },
      {
        "label": "C",
        "text": "It expires simultaneously with the registration on December 31."
      },
      {
        "label": "D",
        "text": "It is supplied with the initial registration and remains on file permanently."
      }
    ],
    "answer": "D"
  },
  {
    "id": 336,
    "topic": "Regulations & Ethics",
    "stem": "Peterson Financial Planning is a small personal financial planning partnership in Missouri that has $10 million in assets under management. As a result of the Dodd-Frank Act, which of the following statements best describes the registration requirement for Peterson Financial Planning?",
    "options": [
      {
        "label": "A",
        "text": "Peterson Financial Planning is required to register as an investment adviser with the SEC but has no requirement to register with the Administrator of the Missouri Department of Securities."
      },
      {
        "label": "B",
        "text": "Peterson Financial Planning is required to register as an investment adviser with the SEC and to notify the Administrator of the Missouri Department of Securities of its operation."
      },
      {
        "label": "C",
        "text": "Peterson Financial Planning is required to register as an adviser with the Administrator of the Missouri Department of Securities."
      },
      {
        "label": "D",
        "text": "Peterson is required to register as an adviser with both the SEC and the Administrator of the Missouri Department of Securities."
      }
    ],
    "answer": "C"
  },
  {
    "id": 337,
    "topic": "Regulations & Ethics",
    "stem": "Which of the following investment advisers, with no place of business in the state, does not qualify for the de minimis exemption?",
    "options": [
      {
        "label": "A",
        "text": "An investment adviser who, during the preceding twelve-month period, has had no more than 6 retail clients."
      },
      {
        "label": "B",
        "text": "An investment adviser who, during the preceding twelve-month period, has had 5 or fewer retail clients."
      },
      {
        "label": "C",
        "text": "An investment adviser who, during the preceding twelve-month period, has had fewer than 6 retail clients."
      },
      {
        "label": "D",
        "text": "An investment adviser who, during the preceding twelve-month period, has had no more than 5 retail clients."
      }
    ],
    "answer": "A"
  },
  {
    "id": 338,
    "topic": "Regulations & Ethics",
    "stem": "A pension consultant who advises corporate retirement plans with assets of $135 million must register with which of the following?",
    "options": [
      {
        "label": "A",
        "text": "SEC"
      },
      {
        "label": "B",
        "text": "Either the state or the SEC"
      },
      {
        "label": "C",
        "text": "Both the state and the SEC"
      },
      {
        "label": "D",
        "text": "The state"
      }
    ],
    "answer": "D"
  },
  {
    "id": 339,
    "topic": "Regulations & Ethics",
    "stem": "Foster Advisers, based in New Jersey, manages $135 million in funds for New Jersey-based clients. As a result of the Dodd-Frank Wall Street Reform and Consumer Protection Act, which of the following statements best describes the registration requirement for Foster Advisers?",
    "options": [
      {
        "label": "A",
        "text": "Foster Advisers is required to register as an adviser with the SEC and has no requirement to notify the Administrator of the New Jersey Department of Securities."
      },
      {
        "label": "B",
        "text": "Foster Advisers is required to register with both the SEC and the Administrator of the New Jersey Department of Securities."
      },
      {
        "label": "C",
        "text": "Foster Advisers is required to register with the Administrator of the New Jersey Department of Securities."
      },
      {
        "label": "D",
        "text": "Foster Advisers is required to register as an adviser with the SEC and notify the Administrator of the New Jersey Department of Securities of its operation."
      }
    ],
    "answer": "D"
  },
  {
    "id": 340,
    "topic": "Regulations & Ethics",
    "stem": "Defalcator Investment Planning (DIP) has $175 million in AUM and has offices in States A, K, and R. DIP would be required to provide a balance sheet as part of its brochure if it charged fees of",
    "options": [
      {
        "label": "A",
        "text": "$1,200 for the next 6 months of advisory service."
      },
      {
        "label": "B",
        "text": "$1,500 for the next year’s advisory service."
      },
      {
        "label": "C",
        "text": "$1,500 for the next 3 months of advisory service."
      },
      {
        "label": "D",
        "text": "$600 for the next 6 months of advisory service."
      }
    ],
    "answer": "B"
  },
  {
    "id": 341,
    "topic": "Regulations & Ethics",
    "stem": "A broker-dealer is NOT considered an investment adviser if",
    "options": [
      {
        "label": "A",
        "text": "the firm has less than 15 advisory accounts totaling less than $1 million"
      },
      {
        "label": "B",
        "text": "the firm's investment advice is limited to 10 or fewer people"
      },
      {
        "label": "C",
        "text": "the firm is registered under the Investment Advisers Act of 1940"
      },
      {
        "label": "D",
        "text": "the investment advisory services are incidental to the broker-dealer's business and no special compensation is received"
      }
    ],
    "answer": "D"
  },
  {
    "id": 342,
    "topic": "Regulations & Ethics",
    "stem": "A state-registered investment adviser maintains custody of client funds and securities. On Thursday, the chief financial officer of the firm informs the chief compliance officer that their net worth is $31,578. Under the provisions of the Uniform Securities Act, the firm would",
    "options": [
      {
        "label": "A",
        "text": "need to increase the amount of their surety bond"
      },
      {
        "label": "B",
        "text": "do nothing, as their net worth is far in excess of the minimum requirement of $10,000"
      },
      {
        "label": "C",
        "text": "send a detailed financial report to the Administrator by the close of business Friday"
      },
      {
        "label": "D",
        "text": "send a detailed financial report to the Administrator by the close of business Monday"
      }
    ],
    "answer": "D"
  },
  {
    "id": 343,
    "topic": "Regulations & Ethics",
    "stem": "With regard to the keeping of records, the Uniform Securities Act states that investment advisers must keep records for",
    "options": [
      {
        "label": "A",
        "text": "5 years"
      },
      {
        "label": "B",
        "text": "5 years, the first 2 in the principal office of the adviser"
      },
      {
        "label": "C",
        "text": "3 years"
      },
      {
        "label": "D",
        "text": "3 years, the first 2 in the principal office of the adviser"
      }
    ],
    "answer": "B"
  },
  {
    "id": 344,
    "topic": "Regulations & Ethics",
    "stem": "An investment adviser to a private fund wishes to qualify for the exemption offered under the Uniform Securities Act when the fund has no more than 100 investors. In order to qualify,",
    "options": [
      {
        "label": "A",
        "text": "the private fund adviser must have less than $110 million in private fund assets under management"
      },
      {
        "label": "B",
        "text": "the fund’s outstanding securities are owned exclusively by persons who, at the time of acquisition of such securities, are individuals with at least $5 million in investments"
      },
      {
        "label": "C",
        "text": "neither the private fund adviser nor any of its advisory affiliates have been convicted of a felony within the past 12 years"
      },
      {
        "label": "D",
        "text": "every investor must have either at least $1 million in assets managed by the investment adviser, or a net worth, excluding the value of the primary residence, in excess of $2.1 million"
      }
    ],
    "answer": "D"
  },
  {
    "id": 345,
    "topic": "Regulations & Ethics",
    "stem": "MidWest Advisory Services has $175 million in assets under management and has offices in 10 Midwest states. Regarding recordkeeping requirements, MidWest must meet those of",
    "options": [
      {
        "label": "A",
        "text": "the SEC."
      },
      {
        "label": "B",
        "text": "each state in which it has a place of business"
      },
      {
        "label": "C",
        "text": "the state in which its principal office is located"
      },
      {
        "label": "D",
        "text": "the state with the most stringent financial requirements"
      }
    ],
    "answer": "A"
  },
  {
    "id": 346,
    "topic": "Regulations & Ethics",
    "stem": "Under the Uniform Securities Act, if not denied, an application for registration as investment adviser will generally become effective how soon after filing?",
    "options": [
      {
        "label": "A",
        "text": "30 days"
      },
      {
        "label": "B",
        "text": "15 days"
      },
      {
        "label": "C",
        "text": "Immediately"
      },
      {
        "label": "D",
        "text": "10 days"
      }
    ],
    "answer": "A"
  },
  {
    "id": 347,
    "topic": "Regulations & Ethics",
    "stem": "Under the Investment Advisers Act of 1940, who is not excluded from the definition of investment adviser when their investment advice is solely incidental to the individual's profession?",
    "options": [
      {
        "label": "A",
        "text": "Engineers"
      },
      {
        "label": "B",
        "text": "Teachers"
      },
      {
        "label": "C",
        "text": "Attorneys"
      },
      {
        "label": "D",
        "text": "Insurance agents"
      }
    ],
    "answer": "D"
  },
  {
    "id": 348,
    "topic": "Regulations & Ethics",
    "stem": "Under the Investment Advisers Act of 1940, the exclusion for providing investment advice that is solely incidental to the practice of a profession is NOT available to",
    "options": [
      {
        "label": "A",
        "text": "teachers"
      },
      {
        "label": "B",
        "text": "real estate agents"
      },
      {
        "label": "C",
        "text": "attorneys"
      },
      {
        "label": "D",
        "text": "engineers"
      }
    ],
    "answer": "B"
  },
  {
    "id": 349,
    "topic": "Regulations & Ethics",
    "stem": "An investment adviser sends a notice offering a research report she has recently prepared to a group of 25 new members of the local Lions Club. Under the NASAA Model Rule on recordkeeping for investment advisers, the firm must keep a copy of the notice along with",
    "options": [
      {
        "label": "A",
        "text": "the date the Administrator approved the research report"
      },
      {
        "label": "B",
        "text": "a memorandum describing the list and its source"
      },
      {
        "label": "C",
        "text": "a copy of the full roster of the local chapter"
      },
      {
        "label": "D",
        "text": "the names of those members to whom the report was sent"
      }
    ],
    "answer": "B"
  },
  {
    "id": 350,
    "topic": "Regulations & Ethics",
    "stem": "If a federal covered adviser's fiscal year ends on November 30, 2017, it must file its annual updating amendment to its Form ADV no later than",
    "options": [
      {
        "label": "A",
        "text": "February 28, 2018"
      },
      {
        "label": "B",
        "text": "March 30, 2018"
      },
      {
        "label": "C",
        "text": "December 31, 2017"
      },
      {
        "label": "D",
        "text": "January 18, 2018"
      }
    ],
    "answer": "A"
  },
  {
    "id": 351,
    "topic": "Regulations & Ethics",
    "stem": "Under all of the following circumstances, the USA requires investment advisers with no place of business in the state to register EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "when an adviser only provides investment advice to 401(k) plans with assets of $250,000 or more"
      },
      {
        "label": "B",
        "text": "when an adviser only provides advice to registered investment companies"
      },
      {
        "label": "C",
        "text": "when an adviser has maintained assets of $100 million or more for 7 out of the last 10 years"
      },
      {
        "label": "D",
        "text": "when an adviser with numerous clients in the state has not been subject to disciplinary action within any state within the last 10 years"
      }
    ],
    "answer": "B"
  },
  {
    "id": 352,
    "topic": "Regulations & Ethics",
    "stem": "Under the Uniform Securities Act, investment advisers are exempt from registration in a state where they have no office if they direct business communications with no more than 5 retail clients within",
    "options": [
      {
        "label": "A",
        "text": "6 months"
      },
      {
        "label": "B",
        "text": "12 months"
      },
      {
        "label": "C",
        "text": "30 days"
      },
      {
        "label": "D",
        "text": "2 years"
      }
    ],
    "answer": "B"
  },
  {
    "id": 353,
    "topic": "Regulations & Ethics",
    "stem": "What is the official designation of the person or agency that enforces the USA in each state?",
    "options": [
      {
        "label": "A",
        "text": "Issuer"
      },
      {
        "label": "B",
        "text": "Registrar"
      },
      {
        "label": "C",
        "text": "Transfer agent"
      },
      {
        "label": "D",
        "text": "Administrator"
      }
    ],
    "answer": "D"
  },
  {
    "id": 354,
    "topic": "Regulations & Ethics",
    "stem": "Which of the following persons are included in the definition of investment adviser?",
    "options": [
      {
        "label": "A",
        "text": "A publisher of a bona fide newspaper, news magazine, or business or financial publication of general and regular circulation"
      },
      {
        "label": "B",
        "text": "A financial planner or other person that provides investment advisory services to others for compensation"
      },
      {
        "label": "C",
        "text": "A bank whose deposits are insured by the FDIC"
      },
      {
        "label": "D",
        "text": "Any person that the Administrator excludes by rule or order"
      }
    ],
    "answer": "B"
  },
  {
    "id": 355,
    "topic": "Client Management",
    "stem": "There are a number of exclusions from the definition of investment adviser. Which of the following would NOT qualify for an exclusion under the Uniform Securities Act?",
    "options": [
      {
        "label": "A",
        "text": "An accountant who conducts seminars on the tax benefits of contributing to IRAs, both traditional and Roth"
      },
      {
        "label": "B",
        "text": "A lawyer who charges an hourly fee for preparing trust documents for individuals referred to her by an investment adviser"
      },
      {
        "label": "C",
        "text": "A teacher at the local high school who receives nominal compensation for giving investment advice to engineers"
      },
      {
        "label": "D",
        "text": "A financial planner who conducts seminars for the local PTA, where he presents the benefits of term life insurance"
      }
    ],
    "answer": "C"
  },
  {
    "id": 356,
    "topic": "Regulations & Ethics",
    "stem": "The Uniform Securities Act's definition of investment adviser would include",
    "options": [
      {
        "label": "A",
        "text": "An investment adviser representative of an advisory firm who makes securities recommendations on a regular basis for compensation"
      },
      {
        "label": "B",
        "text": "Any person who is a federal covered investment adviser"
      },
      {
        "label": "C",
        "text": "A person who, on a regular basis for compensation, offers specific investment advice to clients as to the value of securities"
      },
      {
        "label": "D",
        "text": "A temporary employee hired to assist in administrative responsibilities of an advisory firm"
      }
    ],
    "answer": "C"
  },
  {
    "id": 357,
    "topic": "Regulations & Ethics",
    "stem": "Under the Uniform Securities Act, which of the following persons has to register as an investment adviser?",
    "options": [
      {
        "label": "A",
        "text": "An agent of a broker-dealer who gives investment advice within the course of his duties with the firm for which a fee is charged"
      },
      {
        "label": "B",
        "text": "A broker-dealer who gives advice for which he charges a specific fee"
      },
      {
        "label": "C",
        "text": "A broker-dealer who gives investment advice that is incidental to the course of its business and for which no special compensation is received"
      },
      {
        "label": "D",
        "text": "An attorney who writes a legal opinion for a municipal bond indenture"
      }
    ],
    "answer": "B"
  },
  {
    "id": 358,
    "topic": "Regulations & Ethics",
    "stem": "Which of the following would have to register as an investment adviser under the Uniform Securities Act?",
    "options": [
      {
        "label": "A",
        "text": "A retired aeronautical engineer who charges a nominal fee for holding seminars on opportunities in aerospace stocks"
      },
      {
        "label": "B",
        "text": "An accountant who advises clients about investments as an incidental part of services"
      },
      {
        "label": "C",
        "text": "An economics professor who occasionally gives a lecture to business groups about the stock market"
      },
      {
        "label": "D",
        "text": "A trust company"
      }
    ],
    "answer": "A"
  },
  {
    "id": 359,
    "topic": "Regulations & Ethics",
    "stem": "An investment adviser has its home office in Wisconsin. Its only business is with trust companies, large employee benefit plans, and insurance companies. It has no place of business in Colorado but provides investment advice to two Denver banks, both chartered under Colorado banking laws. There is a new Administrator in Colorado, and it is his opinion that this IA should be required to register in his state. A careful reading of Section 201 of the Uniform Securities Act would indicate that",
    "options": [
      {
        "label": "A",
        "text": "the firm does not have to register because it has no place of business in the state and its only clients are registered financial institutions"
      },
      {
        "label": "B",
        "text": "the Administrator is correct and the firm must register"
      },
      {
        "label": "C",
        "text": "as long as the IA does not have an office in Colorado, there are no conditions that would mandate registration there"
      },
      {
        "label": "D",
        "text": "this firm would be exempt from registration with the Colorado Administrator because it is doing business in more than one state"
      }
    ],
    "answer": "A"
  },
  {
    "id": 360,
    "topic": "Regulations & Ethics",
    "stem": "The Uniform Securities Act would NOT provide an exemption from registration as an investment adviser to an investment adviser who",
    "options": [
      {
        "label": "A",
        "text": "has no place of business in the state and limits clientele to banks and insurance companies"
      },
      {
        "label": "B",
        "text": "has no place of business in the state and limits clientele to broker-dealers"
      },
      {
        "label": "C",
        "text": "is an out-of-state investment adviser and directed business communications to fewer than 12 clients in the state in the past 12-month period"
      },
      {
        "label": "D",
        "text": "has no place of business in the state and limits clientele to other investment advisers"
      }
    ],
    "answer": "C"
  },
  {
    "id": 361,
    "topic": "Regulations & Ethics",
    "stem": "Under the USA, a person who is in the business of providing advice on trading futures contracts in addition to advising clients on securities issued or guaranteed by the U.S. government is",
    "options": [
      {
        "label": "A",
        "text": "not required to be a registered investment adviser in the state"
      },
      {
        "label": "B",
        "text": "required to be a registered investment adviser representative in the state"
      },
      {
        "label": "C",
        "text": "required to be a registered agent in the state"
      },
      {
        "label": "D",
        "text": "required to be a registered investment adviser in the state"
      }
    ],
    "answer": "A"
  },
  {
    "id": 362,
    "topic": "Regulations & Ethics",
    "stem": "Under the Uniform Securities Act, which of the following statements is TRUE about an investment adviser who does not have an office in a state and solicits no more than 5 clients in that state?",
    "options": [
      {
        "label": "A",
        "text": "He is not required to register as an investment adviser in that state."
      },
      {
        "label": "B",
        "text": "He is not liable for violations of the antifraud provisions."
      },
      {
        "label": "C",
        "text": "He is exempt from the advertising requirements in the state."
      },
      {
        "label": "D",
        "text": "He must file a consent to service of process."
      }
    ],
    "answer": "A"
  },
  {
    "id": 363,
    "topic": "Regulations & Ethics",
    "stem": "Under the Uniform Securities Act, an investment adviser would be exempt from registration in a state in which he has no place of business if he",
    "options": [
      {
        "label": "A",
        "text": "is registered as a broker-dealer"
      },
      {
        "label": "B",
        "text": "had no more than 5 clients in that state within the past 12 months"
      },
      {
        "label": "C",
        "text": "had no more than 10 clients in that state within the past 12 months"
      },
      {
        "label": "D",
        "text": "had no more than 15 clients in that state within the past 12 months"
      }
    ],
    "answer": "B"
  },
  {
    "id": 364,
    "topic": "Regulations & Ethics",
    "stem": "Which of the following persons must register as an investment adviser under the Uniform Securities Act?",
    "options": [
      {
        "label": "A",
        "text": "An investment adviser who only serves institutional clients and whose only office is in this state"
      },
      {
        "label": "B",
        "text": "An accountant who makes no pretense of providing investment advisory services but gives incidental advice to clients as a small part of accounting services provided"
      },
      {
        "label": "C",
        "text": "An investment adviser representative with no place of business in the state who has dealt with 7 retail clients during the most recent 12 month period"
      },
      {
        "label": "D",
        "text": "An investment adviser whose advice is limited to securities issued or guaranteed by the U.S. government and who has 3 places of business in the state"
      }
    ],
    "answer": "A"
  },
  {
    "id": 365,
    "topic": "Regulations & Ethics",
    "stem": "Alpha-Beta Advisers (ABA) has its principal office in State X. ABA limits its clientele to insurance companies that are authorized to do business in State X. Which of the following best describes the registration requirements for ABA?",
    "options": [
      {
        "label": "A",
        "text": "Both the SEC and State X"
      },
      {
        "label": "B",
        "text": "SEC only"
      },
      {
        "label": "C",
        "text": "State X only"
      },
      {
        "label": "D",
        "text": "Neither the SEC nor State X"
      }
    ],
    "answer": "C"
  },
  {
    "id": 366,
    "topic": "Regulations & Ethics",
    "stem": "Registration with the state as an investment adviser would be required for a person with an office in this state who",
    "options": [
      {
        "label": "A",
        "text": "manages $13 million in assets for 4 clients"
      },
      {
        "label": "B",
        "text": "only gives advice on securities issued by or guaranteed by the government of the United States"
      },
      {
        "label": "C",
        "text": "manages the portfolio of the KPF Balanced Fund, a registered open-end investment company with $22 million in net assets"
      },
      {
        "label": "D",
        "text": "serves as a pension consultant to the XYZ Employees Retirement Plan, covering 1,200 employees with total assets of $278 million"
      }
    ],
    "answer": "A"
  },
  {
    "id": 367,
    "topic": "Regulations & Ethics",
    "stem": "Who of the following is not exempt from registration as an investment adviser under the Investment Advisers Act of 1940?",
    "options": [
      {
        "label": "A",
        "text": "An adviser, with total AUM of $125 million, specializing in stocks listed on the New York Stock Exchange, whose only place of business is in State F and whose only clients are 110 State F resident individuals"
      },
      {
        "label": "B",
        "text": "An adviser to seven private funds with total assets under management in the U.S. of $125 million"
      },
      {
        "label": "C",
        "text": "An adviser whose clientele consists solely of insurance companies"
      },
      {
        "label": "D",
        "text": "An adviser whose only office is in State G who deals only with State G residents, none of whom is a private fund, and does not deal in securities listed on any national securities exchange"
      }
    ],
    "answer": "A"
  },
  {
    "id": 368,
    "topic": "Regulations & Ethics",
    "stem": "Which of the following parties is most likely to be considered an investment adviser under the Investment Advisers Act of 1940?",
    "options": [
      {
        "label": "A",
        "text": "A CPA who manages investment accounts for 50 clients and charges hourly fees for the service"
      },
      {
        "label": "B",
        "text": "Dow Jones, Inc., publisher of The Wall Street Journal"
      },
      {
        "label": "C",
        "text": "An expert in fixed-income securities whose only clients are individuals and whose only recommendations deal with securities issued or guaranteed by the U.S. Treasury"
      },
      {
        "label": "D",
        "text": "The trust department of Citibank, which handles billions of dollars in trust assets"
      }
    ],
    "answer": "A"
  },
  {
    "id": 369,
    "topic": "Regulations & Ethics",
    "stem": "Under the Uniform Securities Act, all of the following persons with no place of business in the state are exempt from registration as an investment advisers EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "advisers who deal exclusively with federal covered investment advisers located in the state"
      },
      {
        "label": "B",
        "text": "advisers who deal exclusively with savings banks located in the state"
      },
      {
        "label": "C",
        "text": "advisers who deal exclusively with investment companies registered under the Investment Company Act of 1940"
      },
      {
        "label": "D",
        "text": "advisers who have conducted business with no more than 6 individual clients in the state within the last 12 months"
      }
    ],
    "answer": "D"
  },
  {
    "id": 370,
    "topic": "Regulations & Ethics",
    "stem": "Under the Uniform Securities Act, all of the following persons may provide investment advice incidental to their normal business without requiring registration as an investment adviser EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "an engineer"
      },
      {
        "label": "B",
        "text": "a lawyer"
      },
      {
        "label": "C",
        "text": "an economist"
      },
      {
        "label": "D",
        "text": "a teacher"
      }
    ],
    "answer": "C"
  },
  {
    "id": 371,
    "topic": "Regulations & Ethics",
    "stem": "Long-Term Financial Solutions, Inc. (LTFSI), an investment adviser registered in five states, files a Form ADV-W indicating the business is closing. It is being acquired by another federal covered adviser, Gold and Sylver Advisers, LLC. Which of the following statements is correct?",
    "options": [
      {
        "label": "A",
        "text": "Gold and Sylver will not have to amend their Form ADV Part 1 until the filing of their annual updating amendment."
      },
      {
        "label": "B",
        "text": "Gold and Sylver must notify all clients of LTFSI that their advisory contracts have been assigned."
      },
      {
        "label": "C",
        "text": "LTFSI is responsible for ensuring that a copy of the LTFSI corporate charter is preserved for at least three years after the acquisition."
      },
      {
        "label": "D",
        "text": "As the successor firm, Gold and Sylver Advisers must keep copies of the LTFSI corporate charter for at least three years after LTFSI’s acquisition."
      }
    ],
    "answer": "C"
  },
  {
    "id": 372,
    "topic": "Regulations & Ethics",
    "stem": "Reticent Asset Management (RAM) is claiming an exemption from registration with the state because it is an adviser to private funds. One of the requirements to qualify for this exemption is",
    "options": [
      {
        "label": "A",
        "text": "all investors must be qualified clients."
      },
      {
        "label": "B",
        "text": "private fund assets under management cannot exceed $110 million."
      },
      {
        "label": "C",
        "text": "all investors must be accredited."
      },
      {
        "label": "D",
        "text": "there can be no more than 10 investors during any 12-month period."
      }
    ],
    "answer": "A"
  },
  {
    "id": 373,
    "topic": "Regulations & Ethics",
    "stem": "A state-registered investment adviser suddenly incurs a liability that materially affects its net worth, causing it to drop below the required minimum. Which of the following statements is TRUE?",
    "options": [
      {
        "label": "A",
        "text": "The investment adviser must notify the Administrator promptly."
      },
      {
        "label": "B",
        "text": "The investment adviser must increase its surety bond to make up the deficiency."
      },
      {
        "label": "C",
        "text": "The investment adviser must notify the Administrator by the close of business on the following business day."
      },
      {
        "label": "D",
        "text": "The investment adviser is not required to file an amendment to its registration with the Administrator."
      }
    ],
    "answer": "C"
  },
  {
    "id": 374,
    "topic": "Regulations & Ethics",
    "stem": "Under the Uniform Securities Act, which of the following investment advisers with no place of business in the state must register with the state as an investment adviser?",
    "options": [
      {
        "label": "A",
        "text": "An adviser rendering advice to no more than 10 individual clients within a 12-month period"
      },
      {
        "label": "B",
        "text": "An adviser rendering advice solely to broker-dealers"
      },
      {
        "label": "C",
        "text": "An adviser rendering advice to employee benefit plans with at least $1 million in assets"
      },
      {
        "label": "D",
        "text": "An adviser managing more than $110 million in assets"
      }
    ],
    "answer": "A"
  },
  {
    "id": 375,
    "topic": "Regulations & Ethics",
    "stem": "Form PF must be filed by",
    "options": [
      {
        "label": "A",
        "text": "SEC-registered advisers with at least $150 million in private fund assets under management"
      },
      {
        "label": "B",
        "text": "SEC-exempt reporting advisers"
      },
      {
        "label": "C",
        "text": "SEC-registered advisers with no more than $150 million in private fund assets under management"
      },
      {
        "label": "D",
        "text": "state-registered private fund managers, regardless of the amount of assets under management"
      }
    ],
    "answer": "A"
  },
  {
    "id": 376,
    "topic": "Regulations & Ethics",
    "stem": "A discussion referring to blue-sky laws would include all of the following EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "forms requiring issuers selling securities in the state to comply with state securities laws"
      },
      {
        "label": "B",
        "text": "the Securities Act of 1933 and Securities Exchange Act of 1934"
      },
      {
        "label": "C",
        "text": "a state securities law that grants state securities Administrators the power to deny or revoke a broker-dealer's or an agent's registration within its state"
      },
      {
        "label": "D",
        "text": "state laws that are designed to protect the public against fraud in securities sales within a state"
      }
    ],
    "answer": "B"
  },
  {
    "id": 377,
    "topic": "Regulations & Ethics",
    "stem": "Which of the following must register as an investment adviser under the Investment Advisers Act of 1940?",
    "options": [
      {
        "label": "A",
        "text": "A person who provides advice to people who are investing in coin collections"
      },
      {
        "label": "B",
        "text": "A person who provides advice to insurance companies on their portfolios"
      },
      {
        "label": "C",
        "text": "A person who provides advice to people who are investing in antique furniture"
      },
      {
        "label": "D",
        "text": "A person who provides advice to people who are investing in mutual funds registered under the Investment Company Act of 1940"
      }
    ],
    "answer": "D"
  },
  {
    "id": 378,
    "topic": "Regulations & Ethics",
    "stem": "The SEC requires investment advisers registered under the Investment Advisers Act of 1940 to maintain certain books and records for a minimum of",
    "options": [
      {
        "label": "A",
        "text": "3 years"
      },
      {
        "label": "B",
        "text": "5 years"
      },
      {
        "label": "C",
        "text": "1 year"
      },
      {
        "label": "D",
        "text": "6 years"
      }
    ],
    "answer": "B"
  },
  {
    "id": 379,
    "topic": "Regulations & Ethics",
    "stem": "Which of the following is specifically excluded from the definition of an investment adviser providing the investment advice is solely incidental to the business in which the person is engaged?",
    "options": [
      {
        "label": "A",
        "text": "Pension manager"
      },
      {
        "label": "B",
        "text": "Movie star's business manager who handles the star's investment portfolio"
      },
      {
        "label": "C",
        "text": "Industrial engineer"
      },
      {
        "label": "D",
        "text": "Sports representative who advises on securities for a fee"
      }
    ],
    "answer": "C"
  },
  {
    "id": 380,
    "topic": "Regulations & Ethics",
    "stem": "Under the provisions of the Uniform Securities Act, it is NOT necessary for an investment adviser to register when it",
    "options": [
      {
        "label": "A",
        "text": "has a place of business in the state but deals exclusively with federal covered advisers"
      },
      {
        "label": "B",
        "text": "has a place of business in the state but has conducted business with 3 individual investors during the preceding 12 consecutive months"
      },
      {
        "label": "C",
        "text": "is headquartered in a state where it conducts most of its business with broker-dealers only"
      },
      {
        "label": "D",
        "text": "has no place of business in the state and deals with savings and loan associations only"
      }
    ],
    "answer": "D"
  },
  {
    "id": 381,
    "topic": "Regulations & Ethics",
    "stem": "A federal covered IA files a petition for bankruptcy. The firm must",
    "options": [
      {
        "label": "A",
        "text": "notify all of its clients immediately"
      },
      {
        "label": "B",
        "text": "notify the Administrator immediately"
      },
      {
        "label": "C",
        "text": "do nothing until the court decides the disposition of the firm's assets"
      },
      {
        "label": "D",
        "text": "notify the SEC immediately"
      }
    ],
    "answer": "D"
  },
  {
    "id": 382,
    "topic": "Regulations & Ethics",
    "stem": "Under the Uniform Securities Act, who must register as an investment adviser?",
    "options": [
      {
        "label": "A",
        "text": "A financial planner with no place of business in a state and who advises only trust companies"
      },
      {
        "label": "B",
        "text": "A registered broker-dealer who receives compensation for providing investment advice"
      },
      {
        "label": "C",
        "text": "A bank that provides investment advice"
      },
      {
        "label": "D",
        "text": "An accountant who provides advice solely incidental to the business"
      }
    ],
    "answer": "B"
  },
  {
    "id": 383,
    "topic": "Regulations & Ethics",
    "stem": "The sole proprietor of an insurance business that exclusively provides advice on fixed-income annuity contracts",
    "options": [
      {
        "label": "A",
        "text": "need not register under any securities laws"
      },
      {
        "label": "B",
        "text": "must register as an investment adviser under the Investment Advisers Act of 1940"
      },
      {
        "label": "C",
        "text": "must register as an investment adviser representative under the USA"
      },
      {
        "label": "D",
        "text": "must register as a broker-dealer with the SEC"
      }
    ],
    "answer": "A"
  },
  {
    "id": 384,
    "topic": "Regulations & Ethics",
    "stem": "An investment adviser with no place of business in the state is exempt from registration with the state when making recommendations to all of the following EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "AAA Manufacturing Co., with respect to the quality of investment bankers available for an underwriting of AAA securities"
      },
      {
        "label": "B",
        "text": "when the recommendations are made exclusively to individual residents of the state who are accredited investors regarding new issues of exempt securities not registered in that state"
      },
      {
        "label": "C",
        "text": "St. Amelia's college endowment fund"
      },
      {
        "label": "D",
        "text": "Amalgamated Bank"
      }
    ],
    "answer": "B"
  },
  {
    "id": 385,
    "topic": "Regulations & Ethics",
    "stem": "Under the Investment Advisers Act of 1940, which of the following is considered an investment adviser?",
    "options": [
      {
        "label": "A",
        "text": "A person who publishes a regular newsletter of advice on U.S. Treasury bonds and other U.S. government securities"
      },
      {
        "label": "B",
        "text": "The trust officer of a commercial bank who manages investment accounts for clients"
      },
      {
        "label": "C",
        "text": "A syndicated columnist who gives weekly reports and recommendations on investments"
      },
      {
        "label": "D",
        "text": "A lawyer who specializes in consulting on investing in securities"
      }
    ],
    "answer": "D"
  },
  {
    "id": 386,
    "topic": "Regulations & Ethics",
    "stem": "Federally registered investment advisers are obligated to maintain certain books and records as specified by the SEC. Which of the following statements regarding adviser recordkeeping is NOT true?",
    "options": [
      {
        "label": "A",
        "text": "Records originally created on computer may be stored in electronic media."
      },
      {
        "label": "B",
        "text": "Records must be kept for 6 years."
      },
      {
        "label": "C",
        "text": "Written records may be reduced to microfilm."
      },
      {
        "label": "D",
        "text": "Records are subject to surprise audits by the SEC."
      }
    ],
    "answer": "B"
  },
  {
    "id": 387,
    "topic": "Regulations & Ethics",
    "stem": "Under the Uniform Securities Act, a state-registered investment adviser whose only office was in State N would NOT have to register in State O if its only clients were",
    "options": [
      {
        "label": "A",
        "text": "trust companies"
      },
      {
        "label": "B",
        "text": "individual accredited investors"
      },
      {
        "label": "C",
        "text": "complex trusts"
      },
      {
        "label": "D",
        "text": "6 or fewer retail clients"
      }
    ],
    "answer": "A"
  },
  {
    "id": 388,
    "topic": "Regulations & Ethics",
    "stem": "Martin holds both the CPA and the CFP designations. Within the previous year, if he has provided portfolio advice to approximately 40 clients, is Martin required to register as an investment adviser?",
    "options": [
      {
        "label": "A",
        "text": "Yes, because he provides investment advice on a more than incidental basis."
      },
      {
        "label": "B",
        "text": "Yes, because he could receive commission income from investment clients."
      },
      {
        "label": "C",
        "text": "No, because he falls under the de minimis exemption having relatively few clients."
      },
      {
        "label": "D",
        "text": "No, because he is a CPA."
      }
    ],
    "answer": "A"
  },
  {
    "id": 389,
    "topic": "Regulations & Ethics",
    "stem": "Under the Investment Advisers Act of 1940, an adviser is required to be registered with the SEC if",
    "options": [
      {
        "label": "A",
        "text": "the adviser's clients are investment companies registered under the Investment Company Act of 1940"
      },
      {
        "label": "B",
        "text": "the adviser's advice relates solely to securities issued or guaranteed by the U.S. government."
      },
      {
        "label": "C",
        "text": "the adviser is the publisher of a news magazine of general and regular circulation"
      },
      {
        "label": "D",
        "text": "the adviser's clientele is exclusively federal credit unions and the adviser has less than $100 million in assets under management"
      }
    ],
    "answer": "A"
  },
  {
    "id": 390,
    "topic": "Regulations & Ethics",
    "stem": "A state-registered investment adviser with discretionary authority over client accounts discovered on Monday, that the firm's net worth is below the required amount. He must notify the administrator and then file a report no later than the",
    "options": [
      {
        "label": "A",
        "text": "close of business Tuesday, close of business Wednesday"
      },
      {
        "label": "B",
        "text": "close of business Tuesday, close of business Friday"
      },
      {
        "label": "C",
        "text": "close of business Monday, close of business Friday"
      },
      {
        "label": "D",
        "text": "close of business Monday, close of business Wednesday"
      }
    ],
    "answer": "A"
  },
  {
    "id": 391,
    "topic": "Regulations & Ethics",
    "stem": "Platinum Investment in Growth Group, Inc. (PIGGI) is registered in and has its principal office in State W. PIGGI has near-term plans to open offices in State A and B. In an effort to test the waters, PIGGI mails several hundred flyers to prospects in those 2 states. Under the Uniform Securities Act,",
    "options": [
      {
        "label": "A",
        "text": "these flyers could not be mailed until PIGGI was registered in States A and B"
      },
      {
        "label": "B",
        "text": "as long as PIGGI did not maintain an office in either of these states, the flyers could be mailed"
      },
      {
        "label": "C",
        "text": "as a federal covered investment adviser, the flyers would need filing with the SEC"
      },
      {
        "label": "D",
        "text": "these flyers could be mailed, but no accounts can be opened until PIGGI is registered in States A and B"
      }
    ],
    "answer": "A"
  },
  {
    "id": 392,
    "topic": "Regulations & Ethics",
    "stem": "Bulaan Advisory Services, Inc. (BAS), an investment adviser registered in 5 states, was found to have been untruthful in its performance reporting. Once this news was released, most of its clients terminated their advisory contracts. As a result, BAS shuttered its doors on July 18, 2018. Minutes of shareholder meetings must be preserved until at least",
    "options": [
      {
        "label": "A",
        "text": "July 18, 2023."
      },
      {
        "label": "B",
        "text": "December 31, 2018."
      },
      {
        "label": "C",
        "text": "December 31, 2023."
      },
      {
        "label": "D",
        "text": "July 18, 2021."
      }
    ],
    "answer": "D"
  },
  {
    "id": 393,
    "topic": "Regulations & Ethics",
    "stem": "If an investment adviser files an initial registration with a state on June 30, which of the following statements regarding the filing fee to be paid is TRUE?",
    "options": [
      {
        "label": "A",
        "text": "The full year's fee must be paid."
      },
      {
        "label": "B",
        "text": "The fee will be prorated from the filing date."
      },
      {
        "label": "C",
        "text": "The fee will be prorated from the effective date."
      },
      {
        "label": "D",
        "text": "No filing fee is required until December 31."
      }
    ],
    "answer": "A"
  },
  {
    "id": 394,
    "topic": "Regulations & Ethics",
    "stem": "Under the Uniform Securities Act, which of the following statements is TRUE regarding registration of an investment adviser if the application has not been amended?",
    "options": [
      {
        "label": "A",
        "text": "Unless specified earlier, registration becomes effective no later than 90 days after the application is filed."
      },
      {
        "label": "B",
        "text": "Unless specified earlier by the Administrator, the registration becomes effective at noon on the 60th day after application."
      },
      {
        "label": "C",
        "text": "Unless specified earlier by the Administrator, the registration becomes effective no later than noon on the 30th day after application."
      },
      {
        "label": "D",
        "text": "Unless specified earlier, registration becomes effective no sooner than 15 days after the application is filed."
      }
    ],
    "answer": "C"
  },
  {
    "id": 395,
    "topic": "Regulations & Ethics",
    "stem": "The term \"federal covered investment adviser\" would apply to a person who",
    "options": [
      {
        "label": "A",
        "text": "is registered as such under the Investment Advisers Act of 1940"
      },
      {
        "label": "B",
        "text": "limits the advice offered strictly to securities listed on the New York Stock Exchange (NYSE)"
      },
      {
        "label": "C",
        "text": "is registered as such under the Investment Company Act of 1940"
      },
      {
        "label": "D",
        "text": "limits the advice offered strictly to securities issued or guaranteed by the U.S. government or 1 of its political subdivisions"
      }
    ],
    "answer": "A"
  },
  {
    "id": 396,
    "topic": "Regulations & Ethics",
    "stem": "On April 15, ABC Advisers, Inc., made application for registration as an investment adviser with State X. Absent a denial or stop order, registration will become effective",
    "options": [
      {
        "label": "A",
        "text": "April 15"
      },
      {
        "label": "B",
        "text": "May 1"
      },
      {
        "label": "C",
        "text": "May 15"
      },
      {
        "label": "D",
        "text": "April 30"
      }
    ],
    "answer": "C"
  },
  {
    "id": 397,
    "topic": "Regulations & Ethics",
    "stem": "USAAdvisers is registered in 10 Midwest states. Regarding financial requirements, USAAdvisers must meet those of",
    "options": [
      {
        "label": "A",
        "text": "each state in which it has a place of business"
      },
      {
        "label": "B",
        "text": "the state in which its principal office is located"
      },
      {
        "label": "C",
        "text": "the state with the most stringent financial requirements"
      },
      {
        "label": "D",
        "text": "the SEC"
      }
    ],
    "answer": "B"
  },
  {
    "id": 398,
    "topic": "Regulations & Ethics",
    "stem": "ABC Advisers changes its name to XYZ Advisers and also changes its location. Under the Investment Advisers Act of 1940, it must",
    "options": [
      {
        "label": "A",
        "text": "notify the Administrator"
      },
      {
        "label": "B",
        "text": "notify FINRA within seven days"
      },
      {
        "label": "C",
        "text": "amend Form ADV promptly"
      },
      {
        "label": "D",
        "text": "amend Form ADV in advance"
      }
    ],
    "answer": "C"
  },
  {
    "id": 399,
    "topic": "Regulations & Ethics",
    "stem": "Under the NASAA Model Rule on financial requirements for investment advisers, investment advisers who have custody of customer funds are usually required to have a net worth in the amount of",
    "options": [
      {
        "label": "A",
        "text": "$5,000"
      },
      {
        "label": "B",
        "text": "$10,000"
      },
      {
        "label": "C",
        "text": "$50,000"
      },
      {
        "label": "D",
        "text": "$35,000"
      }
    ],
    "answer": "D"
  },
  {
    "id": 400,
    "topic": "Regulations & Ethics",
    "stem": "The USA places a number of recordkeeping requirements on investment advisers. Records required to be kept by all state-registered investment advisers include all of the following EXCEPT",
    "options": [
      {
        "label": "A",
        "text": "a list of discretionary accounts"
      },
      {
        "label": "B",
        "text": "emails"
      },
      {
        "label": "C",
        "text": "bank records"
      },
      {
        "label": "D",
        "text": "a record by security showing each client's interest and location thereof"
      }
    ],
    "answer": "D"
  }
];

export const SERIES65_TOPICS: Series65Topic[] = [
  'Economics',
  'Regulations & Ethics',
  'Investments',
  'Client Management',
];
