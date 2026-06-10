#pragma once
#include <iostream>
#include <fstream>
#include <vector>
#include <cmath>
#include <cassert>
#include <random>
#include <iomanip>
#include <algorithm>
#include <limits>

#include "DifferentialEvolution.h"

namespace de {

// Whale Optimization Algorithm (Mirjalili & Lewis, 2016)
class WhaleOptimization {
public:
    WhaleOptimization(IOptimizable& costFunction,
                      unsigned int populationSize,
                      int E,
                      double b = 1.0,
                      int randomSeed = 42,
                      bool shouldCheckConstraints = true)
        : m_cost(costFunction),
          m_populationSize(populationSize),
          m_E(E),
          m_b(b),
          m_shouldCheckConstraints(shouldCheckConstraints),
          m_bestAgentIndex(0),
          m_minCost(std::numeric_limits<double>::infinity())
    {
        m_generator.seed(randomSeed);
        assert(m_populationSize >= 2);
        m_numberOfParameters = static_cast<int>(m_cost.NumberOfParameters());
        m_constraints = m_cost.GetConstraints();
        m_population.resize(m_populationSize, std::vector<double>(m_numberOfParameters));
        m_minCostPerAgent.resize(m_populationSize);
    }

    void InitPopulation()
    {
        for (auto& whale : m_population) {
            for (int i = 0; i < m_numberOfParameters; i++) {
                double lo = m_constraints[i].isConstrained ? m_constraints[i].lower : -1000.0;
                double hi = m_constraints[i].isConstrained ? m_constraints[i].upper :  1000.0;
                std::uniform_real_distribution<double> dist(lo, hi);
                whale[i] = dist(m_generator);
            }
        }
        for (int i = 0; i < static_cast<int>(m_populationSize); i++) {
            m_minCostPerAgent[i] = m_cost.EvaluteCost(m_population[i]);
            if (m_minCostPerAgent[i] < m_minCost) {
                m_minCost = m_minCostPerAgent[i];
                m_bestAgentIndex = i;
            }
        }
    }

    void Optimize(int iterations)
    {
        std::ofstream logFile("log.txt");

        double eps     = 1.0 / std::pow(10.0, m_E);
        int    eps_iter = -1;
        int    current_iter = 0;

        InitPopulation();

        for (int t = 0; t < iterations; t++) {
            double a = 2.0 - 2.0 * t / static_cast<double>(iterations);
            Step(a);
            ++current_iter;
            if (m_minCost <= eps && eps_iter == -1)
                eps_iter = current_iter;
            PrintStatus();
        }

        if (eps_iter == -1) {
            for (int k = 0; k < 10 && m_minCost > eps; ++k) {
                Step(0.0);
                ++current_iter;
                if (m_minCost <= eps && eps_iter == -1)
                    eps_iter = current_iter;
                PrintStatus();
            }
        }

        std::cout << "Iteration of the first achievement of the required accuracy: "
                  << eps_iter << std::endl;
    }

private:
    static constexpr double PI = 3.14159265358979323846;

    // One WOA iteration:
    //   p < 0.5, |A| < 1  => encircling prey  (exploitation)
    //   p < 0.5, |A| >= 1 => random search    (exploration)
    //   p >= 0.5           => bubble-net spiral (exploitation)
    void Step(double a)
    {
        std::uniform_real_distribution<double> dist01(0.0, 1.0);
        std::uniform_real_distribution<double> distL(-1.0, 1.0);
        std::uniform_int_distribution<int>     distPop(0, static_cast<int>(m_populationSize) - 1);

        const std::vector<double> bestPos = m_population[m_bestAgentIndex];

        for (int i = 0; i < static_cast<int>(m_populationSize); i++) {
            double r1 = dist01(m_generator);
            double r2 = dist01(m_generator);
            double A  = 2.0 * a * r1 - a;
            double C  = 2.0 * r2;
            double l  = distL(m_generator);
            double p  = dist01(m_generator);

            std::vector<double> newPos(m_numberOfParameters);

            if (p < 0.5) {
                if (std::abs(A) < 1.0) {
                    for (int j = 0; j < m_numberOfParameters; j++) {
                        double D = std::abs(C * bestPos[j] - m_population[i][j]);
                        newPos[j] = bestPos[j] - A * D;
                    }
                } else {
                    int r = distPop(m_generator);
                    while (r == i) r = distPop(m_generator);
                    for (int j = 0; j < m_numberOfParameters; j++) {
                        double D = std::abs(C * m_population[r][j] - m_population[i][j]);
                        newPos[j] = m_population[r][j] - A * D;
                    }
                }
            } else {
                for (int j = 0; j < m_numberOfParameters; j++) {
                    double D = std::abs(bestPos[j] - m_population[i][j]);
                    newPos[j] = D * std::exp(m_b * l) * std::cos(2.0 * PI * l) + bestPos[j];
                }
            }

            Clamp(newPos);

            double newCost = m_cost.EvaluteCost(newPos);
            if (newCost < m_minCostPerAgent[i]) {
                m_population[i]      = newPos;
                m_minCostPerAgent[i] = newCost;
                if (newCost < m_minCost) {
                    m_minCost        = newCost;
                    m_bestAgentIndex = i;
                }
            }
        }
    }

    void Clamp(std::vector<double>& pos) const
    {
        if (!m_shouldCheckConstraints) return;
        for (int j = 0; j < m_numberOfParameters; j++) {
            if (m_constraints[j].isConstrained) {
                pos[j] = std::max(m_constraints[j].lower,
                          std::min(m_constraints[j].upper, pos[j]));
            }
        }
    }

    void PrintStatus() const
    {
        std::cout << std::fixed << std::setprecision(m_E + 1);
        std::cout << "Current minimal cost: " << m_minCost << "\t\t";
        std::cout << "Best agent: ";
        for (int j = 0; j < m_numberOfParameters; j++)
            std::cout << m_population[m_bestAgentIndex][j] << " ";
        std::cout << std::endl;
    }

    IOptimizable& m_cost;
    unsigned int  m_populationSize;
    int           m_E;
    double        m_b;
    bool          m_shouldCheckConstraints;
    int           m_numberOfParameters;
    int           m_bestAgentIndex;
    double        m_minCost;

    std::default_random_engine             m_generator;
    std::vector<std::vector<double>>       m_population;
    std::vector<double>                    m_minCostPerAgent;
    std::vector<IOptimizable::Constraints> m_constraints;
};

} // namespace de
