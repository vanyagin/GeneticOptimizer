#pragma once
#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <cmath>
#include <cassert>
#include <random>
#include <iomanip>
#include <utility>
#include <memory>
#include <limits>
#include <functional>
#include <algorithm>
#include <numeric>

namespace de
{
    class IOptimizable
    {
    public:
        struct Constraints
        {
            Constraints(double lower = 0.0, double upper = 1.0, bool isConstrained = false) :
                lower(lower),
                upper(upper),
                isConstrained(isConstrained)
            {
            }

            bool Check(double candidate)
            {
                if (isConstrained)
                {
                    return candidate >= lower && candidate <= upper;
                }
                return true;
            }

            double lower;
            double upper;
            bool isConstrained;
        };

        virtual double EvaluteCost(std::vector<double> x) = 0;
        virtual unsigned int NumberOfParameters() const = 0;
        virtual std::vector<Constraints> GetConstraints() const = 0;
        virtual ~IOptimizable() {}
    };

    class DifferentialEvolution
    {
    public:
        /*
         * \param costFunction   целевая функция
         * \param populationSize размер популяции
         * \param F              начальный масштабирующий коэффициент (jDE адаптирует его)
         * \param CR             начальная вероятность скрещивания (jDE адаптирует её)
         * \param E              показатель требуемой точности (eps = 10^-E)
         * \param p              доля лучших особей для pbest (current-to-pbest/1), по умолчанию 0.1
         * \param randomSeed     зерно генератора
         * \param shouldCheckConstraints  проверять ли ограничения
         */
        DifferentialEvolution(  IOptimizable& costFunction,
                                unsigned int populationSize,
                                double F = 0.65,
                                double CR = 0.5,
                                int E = 5,
                                double p = 0.1,
                                int randomSeed = 42,
                                bool shouldCheckConstraints = true) :
            m_cost(costFunction),
            m_populationSize(populationSize),
            m_F(F),
            m_CR(CR),
            m_E(E),
            m_p(p),
            m_bestAgentIndex(0),
            m_minCost(std::numeric_limits<double>::infinity()),
            m_shouldCheckConstraints(shouldCheckConstraints)
        {
            m_generator.seed(randomSeed);
            assert(m_populationSize >= 4);

            m_numberOfParameters = static_cast<int>(m_cost.NumberOfParameters());

            m_population.resize(populationSize);
            for (auto& agent : m_population)
                agent.resize(m_numberOfParameters);

            m_minCostPerAgent.resize(m_populationSize);
            m_F_vec.assign(m_populationSize, m_F);
            m_CR_vec.assign(m_populationSize, m_CR);

            m_constraints = costFunction.GetConstraints();
        }

        void InitPopulation()
        {
            std::shared_ptr<std::uniform_real_distribution<double>> distribution;

            for (auto& agent : m_population)
            {
                for (int i = 0; i < m_numberOfParameters; i++)
                {
                    if (m_constraints[i].isConstrained)
                    {
                        distribution = std::make_shared<std::uniform_real_distribution<double>>(
                            m_constraints[i].lower, m_constraints[i].upper);
                    }
                    else
                    {
                        distribution = std::make_shared<std::uniform_real_distribution<double>>(
                            g_defaultLowerConstraint, g_defaultUpperConstraint);
                    }
                    agent[i] = (*distribution)(m_generator);
                }
            }

            for (int i = 0; i < static_cast<int>(m_populationSize); i++)
            {
                m_minCostPerAgent[i] = m_cost.EvaluteCost(m_population[i]);

                if (m_minCostPerAgent[i] < m_minCost)
                {
                    m_minCost = m_minCostPerAgent[i];
                    m_bestAgentIndex = i;
                }
            }
        }

        // Мутация current-to-pbest/1 + jDE-адаптация F и CR
        void SelectionAndCrossing()
        {
            // jDE-параметры (Brest et al., 2006)
            static constexpr double tau1 = 0.1;
            static constexpr double tau2 = 0.1;
            static constexpr double F_lo = 0.1;
            static constexpr double F_hi = 0.9;

            std::uniform_real_distribution<double> dist01(0.0, 1.0);
            std::uniform_int_distribution<int>     distPop(0, static_cast<int>(m_populationSize) - 1);
            std::uniform_int_distribution<int>     distParam(0, static_cast<int>(m_numberOfParameters) - 1);

            // Индексы популяции, отсортированные по возрастанию стоимости (для pbest)
            int pbest_size = std::max(1, static_cast<int>(m_p * m_populationSize));
            std::vector<int> sortedIdx(m_populationSize);
            std::iota(sortedIdx.begin(), sortedIdx.end(), 0);
            std::sort(sortedIdx.begin(), sortedIdx.end(), [this](int a, int b) {
                return m_minCostPerAgent[a] < m_minCostPerAgent[b];
            });

            double minCost        = m_minCostPerAgent[0];
            int    bestAgentIndex = 0;

            for (int x = 0; x < static_cast<int>(m_populationSize); x++)
            {
                // jDE: пробуем новые F и CR для особи x
                double F_new  = (dist01(m_generator) < tau1)
                                ? (F_lo + dist01(m_generator) * F_hi)
                                : m_F_vec[x];
                double CR_new = (dist01(m_generator) < tau2)
                                ? dist01(m_generator)
                                : m_CR_vec[x];

                // Случайная pbest-особь из топ-p%
                std::uniform_int_distribution<int> distPbest(0, pbest_size - 1);
                int pbest_idx = sortedIdx[distPbest(m_generator)];

                // r1 != x
                int r1 = x;
                while (r1 == x)
                    r1 = distPop(m_generator);

                // r2 != x, r2 != r1
                int r2 = x;
                while (r2 == x || r2 == r1)
                    r2 = distPop(m_generator);

                // current-to-pbest/1:  v = x + F*(pbest - x) + F*(r1 - r2)
                std::vector<double> z(m_numberOfParameters);
                for (int i = 0; i < m_numberOfParameters; i++)
                {
                    z[i] = m_population[x][i]
                         + F_new * (m_population[pbest_idx][i] - m_population[x][i])
                         + F_new * (m_population[r1][i]        - m_population[r2][i]);
                }

                // Гарантированный индекс скрещивания
                int R = distParam(m_generator);

                // Бинарное скрещивание
                std::vector<double> newX(m_numberOfParameters);
                for (int i = 0; i < m_numberOfParameters; i++)
                {
                    newX[i] = (dist01(m_generator) < CR_new || i == R)
                              ? z[i]
                              : m_population[x][i];
                }

                if (m_shouldCheckConstraints && !CheckConstraints(newX))
                {
                    x--;
                    continue;
                }

                double newCost = m_cost.EvaluteCost(newX);
                if (newCost < m_minCostPerAgent[x])
                {
                    m_population[x]      = newX;
                    m_minCostPerAgent[x] = newCost;
                    m_F_vec[x]           = F_new;   // jDE: принимаем новые параметры
                    m_CR_vec[x]          = CR_new;
                }

                if (m_minCostPerAgent[x] < minCost)
                {
                    minCost        = m_minCostPerAgent[x];
                    bestAgentIndex = x;
                }
            }

            m_minCost        = minCost;
            m_bestAgentIndex = bestAgentIndex;
        }

        void Optimize(int iterations)
        {
            std::ofstream logFile("log.txt");
            if (!logFile) {
                std::cerr << "Error opening file!" << std::endl;
                return;
            }

            int    eps_iter    = -1;
            double eps         = 1.0 / std::pow(10.0, m_E);
            InitPopulation();

            int current_iter = 0;
            for (int i = 0; i < iterations; i++)
            {
                SelectionAndCrossing();
                current_iter++;
                if (m_minCost <= eps && eps_iter == -1)
                    eps_iter = current_iter;

                std::cout << std::fixed << std::setprecision(m_E + 1);
                std::cout << "Current minimal cost: " << m_minCost << "\t\t";
                std::cout << "Best agent: ";
                for (int j = 0; j < m_numberOfParameters; j++)
                    std::cout << m_population[m_bestAgentIndex][j] << " ";
                std::cout << std::endl;
            }

            if (eps_iter == -1) {
                int max_extra = 10;
                int k = 0;
                while (m_minCost > eps && k < max_extra) {
                    k++;
                    SelectionAndCrossing();
                    current_iter++;
                    if (m_minCost <= eps && eps_iter == -1)
                        eps_iter = current_iter;

                    std::cout << std::fixed << std::setprecision(m_E + 1);
                    std::cout << "Current minimal cost: " << m_minCost << "\t\t";
                    std::cout << "Best agent: ";
                    for (int j = 0; j < m_numberOfParameters; j++)
                        std::cout << m_population[m_bestAgentIndex][j] << " ";
                    std::cout << std::endl;
                }
            }

            std::cout << "Iteration of the first achievement of the required accuracy: "
                      << eps_iter << std::endl;
        }

    private:
        bool CheckConstraints(std::vector<double> agent)
        {
            for (int i = 0; i < static_cast<int>(agent.size()); i++)
            {
                if (!m_constraints[i].Check(agent[i]))
                    return false;
            }
            return true;
        }

        IOptimizable& m_cost;
        unsigned int  m_populationSize;
        double        m_F;
        double        m_CR;
        int           m_E;
        double        m_p;

        int  m_numberOfParameters;
        bool m_shouldCheckConstraints;

        std::function<void(const DifferentialEvolution&)> m_callback;
        std::function<bool(const DifferentialEvolution&)> m_terminationCondition;

        std::default_random_engine             m_generator;
        std::vector<std::vector<double>>       m_population;
        std::vector<double>                    m_minCostPerAgent;
        std::vector<double>                    m_F_vec;   // per-individual F (jDE)
        std::vector<double>                    m_CR_vec;  // per-individual CR (jDE)
        std::vector<IOptimizable::Constraints> m_constraints;

        int    m_bestAgentIndex;
        double m_minCost;

        static constexpr double g_defaultLowerConstraint = -std::numeric_limits<double>::infinity();
        static constexpr double g_defaultUpperConstraint  =  std::numeric_limits<double>::infinity();
    };
}
