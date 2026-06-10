// GeneticAlgoritm.cpp

using namespace std;

#include "de/DifferentialEvolution.h"
#include "de/TestFunctions.h"
#include "de/WhaleOptimization.h"


int main(int argc, char* argv[])
{
    setlocale(LC_ALL, "C");

    if (argc != 9) {
        std::cerr << "Wrong argument count.\n";
        std::cerr << "Format: GeneticAlgoritm.exe Algorithm Type N PopulationSize F CR E Iterations\n";
        std::cerr << "  Algorithm: de | woa\n";
        std::cerr << "  Type:      file | <exe-name>\n";
        return 1;
    }

    try {
        std::string algo       = argv[1];
        std::string type       = argv[2];
        int    N               = std::stoi(argv[3]);
        int    populationSize  = std::stoi(argv[4]);
        double F               = std::stod(argv[5]);
        double CR              = std::stod(argv[6]);
        int    E               = std::stoi(argv[7]);
        int    iterations      = std::stoi(argv[8]);

        auto run = [&](de::IOptimizable& func) {
            if (algo == "woa") {
                de::WhaleOptimization woa(func, populationSize, E);
                woa.Optimize(iterations);
            } else {
                de::DifferentialEvolution de(func, populationSize, F, CR, E);
                de.Optimize(iterations);
            }
        };

        if (type == "file") {
            de::FileFunc dataFun("data.txt");
            run(dataFun);
        } else {
            de::ExeFunc exeFun(type, N);
            run(exeFun);
        }
    }
    catch (std::exception& e) {
        std::cerr << "Wrong argument processing: " << e.what() << "\n";
        return 1;
    }

    return 0;
}
