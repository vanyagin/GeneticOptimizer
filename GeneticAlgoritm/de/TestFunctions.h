#pragma once
#define _USE_MATH_DEFINES
#include <vector>
#include <cassert>
#include <stdexcept>
#include <muParser.h>
#include <fstream>
#include <string>
#include <filesystem>

#include "DifferentialEvolution.h"


namespace de
{

    class FileFunc : public IOptimizable
    {
    public:

        mu::Parser parser;

        // �����������, ����������� ��� �����
        explicit FileFunc(const std::string& filename)
        {
            LoadFromFile(filename);
        }

        double EvaluteCost(std::vector<double> x) override {
            assert(x.size() == m_numberOfParams);
            
            // ���������, ���������� �� ���������� ��� ���������� �������
            size_t numArgs = m_numberOfParams;
            if (numArgs == 0) {
                throw std::runtime_error("It is not possible to evaluate a function without arguments.");
            }

            // ���������� ���������� � �������
            for (size_t i = 0; i < numArgs; ++i) {
                std::string var = "x" + std::to_string(i);
                parser.DefineVar(var.c_str(), &x[i]);
            }
            return parser.Eval();
        }

        unsigned int NumberOfParameters() const override
        {
            return m_numberOfParams;
        }

        std::vector<Constraints> GetConstraints() const override
        {
            return m_constraints;
            /*std::vector<Constraints> constr(NumberOfParameters());
            for (auto& c : constr)
            {
                c = Constraints(0, 2, true);
            }
            return constr;*/
        }

    private:
        void LoadFromFile(const std::string& filename) {
            std::ifstream file(filename);
            if (!file.is_open()) {
                throw std::runtime_error("Could not open file: " + filename);
            }

            // ���������� ������ � ��������
            std::string functionLine;
            getline(file, functionLine);
            // ������� �������
            //add mu:parser
            parser.SetExpr(functionLine);

            // ���������� �����������
            std::string constraintLine;
            while (getline(file, constraintLine)) {
                ParseConstraint(constraintLine);
            }

            // ������������ ���������� ����������
            m_numberOfParams = static_cast<unsigned int>(m_constraints.size());

            file.close();
        }

        void ParseConstraint(const std::string& constraintLine) {
            std::istringstream iss(constraintLine);
            std::string varName;
            //char colon;
            double lowerBound, upperBound;
            bool inclusive = true;

            iss >> varName /* >> colon */ >> lowerBound >> upperBound >> inclusive;
            m_constraints.emplace_back(lowerBound, upperBound, inclusive);
            //iss >> varName >> lowerBound >> upperBound;
            //m_constraints.emplace_back(lowerBound, upperBound);
        }

        //std::vector<Term> m_terms;
        std::vector<Constraints> m_constraints;
        unsigned int m_numberOfParams;
    };





    class ExeFunc : public IOptimizable
    {
    public:
        explicit ExeFunc(const std::string file, int numArgs)
        {
            std::string command = "uploads\\" + file;
            struct stat buffer;

            if (stat(command.c_str(), &buffer) != 0) {
                std::cout << "File not found: " << file << std::endl;
                return;
            }

            filename = file;

            // ������������ ���������� ����������
            m_numberOfParams = numArgs;

        }

        double EvaluteCost(std::vector<double> x) override {
            assert(x.size() == m_numberOfParams);
            // ���������, ���������� �� ���������� ��� ���������� �������
            size_t numArgs = m_numberOfParams;
            if (numArgs == 0) {
                throw std::runtime_error("It is not possible to evaluate a function without arguments.");
            }

            // ��������� ���� ��� ������
            std::ofstream dataFile("data2.txt");
            if (dataFile.is_open()) {
                for (auto value : x) {
                    dataFile << value << "\n"; // ������ ������� �������� � ����� ������
                }
                dataFile.close(); // �������� ����� ����� ������
            }
            else {
                std::cerr << "Failed to open file for writing!" << std::endl;
            }


            std::string command = "\"uploads\\" + filename + "\"";

            std::system(command.c_str());


            std::string resLine;
            
            std::ifstream resFile("res.txt");
            if (resFile.is_open()) {
                std::getline(resFile, resLine);
            }
            resFile.close();
            size_t pos = 0;
            while ((pos = resLine.find(',', pos)) != std::string::npos) {
                resLine.replace(pos, 1, ".");
                pos++;
            }
            return std::stod(resLine);
        }

        unsigned int NumberOfParameters() const override
        {
            return m_numberOfParams;
        }

        std::vector<Constraints> GetConstraints() const override
        {
            std::vector<Constraints> constr(NumberOfParameters());
            for (auto& c : constr)
            {
                c = Constraints(-5, 5, true);
            }
            return constr;
        }

    private:
        std::vector<Constraints> m_constraints;
        unsigned int m_numberOfParams;
        string filename;
    };

}
